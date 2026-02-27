# SparkMotion Load Tests

Validate the critical path for 200K attendees/event.

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

Grafana k6 Cloud **paid tier** required for the 5K RPS redirect test (free tier caps at 100 VUs).

## What's Tested

| Priority | Test | Target | Script |
|----------|------|--------|--------|
| P0 | Worker redirect (KV hit) | p95 < 50ms @ 5K RPS | `redirect-load.js` |
| P0 | Hub redirect (DB/Redis) | p95 < 500ms @ 500 RPS | `hub-redirect-load.js` |
| P1 | Upstash pipeline | p95 < 100ms @ 6K cmd/s | `upstash-pipeline.js` |
| P1 | Dashboard polling | p95 < 2s, 10 dashboards | `analytics-load.js` |
| P2 | Flush-taps drain | > 100K items/min | `flush-taps-bench.ts` |
| P2 | CSV export (tRPC) | p95 < 10s, 50K rows | `csv-export-load.js` |
| P3 | Geo routing | correct > 95%, p95 < 500ms | `geo-routing-load.js` |
| P3 | Analytics queries (raw) | < 2s each | `seed.ts bench-queries` |

## Execution Order

### 1. Seed PostgreSQL

Creates loadtest org, event, 200K bands, 600K tap logs.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts postgres
```

### 2. Seed Geo Events

Creates 5 city events (Nashville, Dallas, Denver, Chicago, Atlanta) with coordinates and 100 bands each.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts seed-geo
```

### 3. Seed Loadtest User

Creates an ADMIN user for authenticated tests. Set `TEST_EMAIL` and `TEST_PASSWORD` in `.env` first.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts seed-user
```

### 4. Seed Cloudflare KV

Populates 200K band entries (`LOADTEST-000001` through `LOADTEST-200000`).

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts kv
```

### 5. Worker Redirect Test (P0 Critical)

Ramps to 5K RPS via Grafana Cloud. Tests CF Worker KV-hit path.

```bash
# Local (laptop — up to ~2K RPS)
k6 run -e WORKER_URL=https://sparkmotion-redirect.xxx.workers.dev load-tests/redirect-load.js

# Cloud (paid tier — 5K RPS)
k6 run --out cloud -e WORKER_URL=https://sparkmotion-redirect.xxx.workers.dev -e SCENARIO=cloud load-tests/redirect-load.js
```

**Pass criteria:** p50 < 20ms, p95 < 50ms, p99 < 100ms, errors < 0.1%

### 6. Hub Redirect Test (P0)

Tests Hub `/e` endpoint on Vercel staging (DB/Redis path when KV misses).

```bash
# Local
k6 run -e HUB_URL=https://geo.sparkmotion.net load-tests/hub-redirect-load.js

# Cloud
k6 run --out cloud -e HUB_URL=https://geo.sparkmotion.net -e SCENARIO=cloud load-tests/hub-redirect-load.js
```

**Pass criteria:** p50 < 100ms, p95 < 500ms, p99 < 1s, errors < 1%

### 7. Upstash Pipeline Test (P1)

Isolates Redis throughput. Run if redirect test shows latency issues.

```bash
k6 run \
  -e UPSTASH_REDIS_REST_URL=https://xxx.upstash.io \
  -e UPSTASH_REDIS_REST_TOKEN=xxx \
  -e LOADTEST_EVENT_ID=xxx \
  load-tests/upstash-pipeline.js
```

**Pass criteria:** p95 < 100ms, errors < 1%

### 8. Dashboard Polling Test (P1)

Simulates 10 concurrent admin dashboards polling every 5s for 2 minutes.

```bash
k6 run \
  -e ADMIN_URL=https://admin-staging.sparkmotion.net \
  -e TEST_PASSWORD=xxx \
  -e LOADTEST_EVENT_ID=xxx \
  load-tests/analytics-load.js
```

**Pass criteria:** KPIs p95 < 2s, velocity p95 < 500ms, event summary p95 < 2s, hourly p95 < 500ms, errors < 1%

### 9. Flush-Taps Drain Benchmark (P2)

Seeds 100K pending taps, triggers cron repeatedly, measures drain rate.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts redis
pnpm --filter @sparkmotion/load-tests exec tsx flush-taps-bench.ts
```

**Pass criteria:** > 100K items/min

### 10. CSV Export Test (P2)

Tests tRPC `analytics.exportTaps` endpoint with 3 concurrent admins.

```bash
k6 run \
  -e ADMIN_URL=https://admin-staging.sparkmotion.net \
  -e TEST_PASSWORD=xxx \
  -e LOADTEST_EVENT_ID=xxx \
  load-tests/csv-export-load.js
```

**Pass criteria:** p95 < 10s, errors < 5%

### 11. Geo Routing Test (P3)

Tests Hub `/e` geolocation routing with lat/lng query params across 5 cities + 3 nearby + 1 far-away.

```bash
k6 run -e HUB_URL=https://geo.sparkmotion.net load-tests/geo-routing-load.js
```

**Pass criteria:** p95 < 500ms, correct routing > 95%, errors < 1%

### 12. Analytics Query Benchmark (P3)

Runs the 4 core analytics queries against 600K rows.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts bench-queries
```

**Pass criteria:** Each query < 2s

### 13. Cleanup

Remove all `LOADTEST-*` data from KV, Redis, and PostgreSQL. Includes pre/post audit and safety gate.

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts cleanup
```

## Pass/Fail Summary

| Test | Pass | Fail |
|------|------|------|
| Worker redirect p95 | < 50ms | > 50ms |
| Worker redirect p99 | < 100ms | > 100ms |
| Worker redirect errors | < 0.1% | > 0.1% |
| Hub redirect p95 | < 500ms | > 500ms |
| Hub redirect p99 | < 1s | > 1s |
| Hub redirect errors | < 1% | > 1% |
| Upstash pipeline p95 | < 100ms | > 100ms |
| Dashboard KPIs p95 | < 2s | > 2s |
| Dashboard velocity p95 | < 500ms | > 500ms |
| Flush-taps drain | > 100K/min | < 50K/min |
| CSV export p95 | < 10s | > 10s |
| Geo routing correctness | > 95% | < 95% |
| Geo routing p95 | < 500ms | > 500ms |
| KPIs query | < 2s | > 5s |
| Taps by day query | < 2s | > 5s |
| Top events query | < 2s | > 5s |

## Grafana Cloud (Recommended)

Stream results to Grafana Cloud for real-time dashboards, historical comparison, and threshold pass/fail tracking.

1. Sign up at [grafana.com/products/cloud/k6](https://grafana.com/products/cloud/k6/)
2. Go to **Settings > API Tokens** and create a k6 Cloud API token
3. Add `K6_CLOUD_TOKEN` to your `load-tests/.env`
4. Run with `--out cloud`:

```bash
k6 run --out cloud -e WORKER_URL=https://sparkmotion-redirect.xxx.workers.dev -e SCENARIO=cloud load-tests/redirect-load.js
```

Results stream to your Grafana Cloud dashboard in real-time. `handleSummary()` still generates local JSON artifacts for CI.

## Notes

- **k6 local limits**: A single laptop can sustain ~2K RPS. Use `--out cloud` with `SCENARIO=cloud` for 5K RPS tests.
- **Band rows required**: `flush-taps` resolves NFC bandId strings to CUIDs via DB. Always run `seed.ts postgres` before `seed.ts redis`, or the cron will silently skip all taps.
- **Authenticated tests**: `analytics-load.js` and `csv-export-load.js` require a seeded admin user. Run `seed.ts seed-user` first.
- **Environment**: Tests run against staging infrastructure using `LOADTEST-` prefixed data for easy isolation and cleanup.
- **Cleanup safety**: The cleanup command includes a safety gate that refuses to delete if non-loadtest events are found under the org.
