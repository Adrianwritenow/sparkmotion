# SparkMotion Load Tests

Validate the critical path for 200K attendees/event before Feb 27 launch.

## Prerequisites

```bash
# k6 (load testing tool)
brew install k6

# Node dependencies (from monorepo root)
pnpm install

# Copy and fill in environment variables
cp load-tests/.env.example load-tests/.env
```

Upstash must be on **Pro tier** ($10/mo) for the pipeline test. Free tier (115 cmd/sec) will fail at 6K cmd/sec.

## What's Tested

| Priority | Test | Target |
|----------|------|--------|
| P0 | Worker redirect latency | p95 < 50ms @ 667 RPS |
| P1 | Upstash pipeline throughput | p95 < 100ms @ 6K cmd/sec |
| P2 | flush-taps drain rate | > 100K items/min |
| P3 | Analytics queries (600K rows) | < 2s each |

## Execution Order

### 1. Seed PostgreSQL

Creates loadtest org, event, 200K bands, 600K tap logs.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts postgres
```

### 2. Seed Cloudflare KV

Populates 200K band entries (`LOADTEST-000001` through `LOADTEST-200000`).

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts kv
```

### 3. Worker Redirect Test (P0 Critical)

Three phases: warmup (100 RPS), sustained (667 RPS, 3 min), burst (2000 RPS, 1 min).

```bash
k6 run -e WORKER_URL=https://sparkmotion-redirect.xxx.workers.dev load-tests/redirect-load.js
```

**Pass criteria:** p50 < 20ms, p95 < 50ms, p99 < 100ms, errors < 0.1%

### 4. Upstash Pipeline Test (P1)

Isolates Redis throughput. Run if redirect test shows latency issues.

```bash
k6 run \
  -e UPSTASH_REDIS_REST_URL=https://xxx.upstash.io \
  -e UPSTASH_REDIS_REST_TOKEN=xxx \
  load-tests/upstash-pipeline.js
```

**Pass criteria:** p95 < 100ms, errors < 1%

### 5. Flush-Taps Drain Benchmark (P2)

Seeds 100K pending taps, triggers cron repeatedly, measures drain rate.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts redis
pnpm --filter @sparkmotion/load-tests exec tsx flush-taps-bench.ts
```

**Pass criteria:** > 100K items/min

### 6. Analytics Query Benchmark (P3)

Runs the 4 core analytics queries against 600K rows.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts bench-queries
```

**Pass criteria:** Each query < 2s

### 7. Cleanup

Remove all `LOADTEST-*` data from KV, Redis, and PostgreSQL.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts cleanup
```

## Pass/Fail Summary

| Test | Pass | Fail |
|------|------|------|
| Redirect p95 | < 50ms | > 50ms |
| Redirect p99 | < 100ms | > 100ms |
| Redirect errors | < 0.1% | > 0.1% |
| Upstash pipeline p95 | < 100ms | > 100ms |
| Flush-taps drain | > 100K/min | < 50K/min |
| KPIs query | < 2s | > 5s |
| Taps by day query | < 2s | > 5s |
| Top events query | < 2s | > 5s |

## Grafana Cloud (Recommended)

Stream results to Grafana Cloud for real-time dashboards, historical comparison, and threshold pass/fail tracking.

1. Sign up at [grafana.com/products/cloud/k6](https://grafana.com/products/cloud/k6/) (free tier: 50 tests/month)
2. Go to **Settings > API Tokens** and create a k6 Cloud API token
3. Add `K6_CLOUD_TOKEN` to your `load-tests/.env`
4. Run with `--out cloud`:

```bash
k6 run --out cloud -e WORKER_URL=https://sparkmotion-redirect.xxx.workers.dev load-tests/redirect-load.js
```

Results stream to your Grafana Cloud dashboard in real-time. `handleSummary()` still generates local JSON artifacts for CI.

## Notes

- **k6 local limits**: A single laptop can sustain ~2K RPS. The burst phase may hit file descriptor limits. If so, run `ulimit -n 10240` first or use a cloud VM.
- **Band rows required**: `flush-taps` resolves NFC bandId strings to CUIDs via DB. Always run `seed.ts postgres` before `seed.ts redis`, or the cron will silently skip all taps.
- **Environment**: Tests run against production infrastructure using `LOADTEST-` prefixed data for easy isolation and cleanup.
