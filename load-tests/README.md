# SparkMotion Load Tests

Validate the critical path for 200K attendees/event across all 5 system components simultaneously.

## Prerequisites

```bash
# k6 (load testing tool)
brew install k6

# Node dependencies (from monorepo root)
pnpm install

# Copy and fill in environment variables
cp load-tests/.env.example load-tests/.env.staging
```

Upstash must be on **Pro tier** ($10/mo) for the pipeline throughput. Free tier (115 cmd/sec) will fail at high RPS.

Grafana k6 Cloud **paid tier** required for the 5K+ RPS test (free tier caps at 100 VUs).

## Architecture

All load testing is driven by a single unified script (`e2e-load.js`) that runs 5 concurrent scenarios:

| Scenario | Purpose | Load |
|----------|---------|------|
| `tappers` | Worker redirect (KV hit) — stepped plateau 500→10K RPS | ramping-arrival-rate |
| `admins` | Admin dashboard polling analytics every 5s | 10 constant VUs |
| `exporters` | CSV export tRPC endpoint every 30s | 2 constant VUs |
| `cron_trigger` | Flush-taps cron every 15s | constant-arrival-rate |
| `queue_sampler` | Redis queue depth observability every 30s | constant-arrival-rate |

## What's Tested (Custom Metrics)

| Metric | Type | Target | Fail |
|--------|------|--------|------|
| `redirect_latency` | Trend | p95 < 50ms | p95 > 100ms |
| `analytics_latency` | Trend | p95 < 5s | p95 > 8s |
| `csv_export_latency` | Trend | p95 < 10s | p95 > 15s |
| `error_rate` | Rate | < 1% | > 3% |
| `kv_hit_rate` | Rate | > 99% | — |
| `cron_errors` | Rate | — | > 10% |
| `cron_flushed` | Counter | observability | — |
| `queue_depth` | Gauge | observability | — |

## Execution

### 1. Seed Data

Seed 3 events × 200K bands in KV + PostgreSQL (required for multi-event tapper scenario):

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts seed-multi-event
```

Seed loadtest admin user (required for admin/exporter scenarios):

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts seed-user
```

### 2. Run Full e2e Test

```bash
# Local (streams metrics to Grafana Cloud if K6_CLOUD_TOKEN set):
./load-tests/run-k6.sh staging e2e-load.js

# Grafana Cloud generators (distributed load — use for 5K+ RPS):
./load-tests/run-k6.sh staging e2e-load.js --cloud-exec

# Local only, no cloud streaming:
./load-tests/run-k6.sh staging e2e-load.js --no-cloud
```

**Budget reminder:** 500 free VUh/month on Grafana Cloud. The full 13-minute test uses ~1,300 VUh — use `--cloud-exec` for capacity testing only.

### 3. Standalone Benchmarks

Flush-taps cron drain throughput (separate from k6 — measures cron in isolation):

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts redis
pnpm --filter @sparkmotion/load-tests exec tsx flush-taps-bench.ts
```

Analytics query benchmarks against 600K tap log rows:

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts bench-queries
```

CSV export benchmark (50K, 100K, 600K rows):

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts bench-csv
```

### 4. Cleanup

Remove all `LOADTEST-*` data from KV, Redis, and PostgreSQL:

```bash
pnpm --filter @sparkmotion/load-tests exec tsx seed.ts cleanup
```

Includes pre/post audit and a safety gate that refuses to delete if non-loadtest events are present.

## Pass/Fail Thresholds

| Metric | Pass (warn) | Fail (hard) |
|--------|-------------|-------------|
| `redirect_latency` p95 | < 50ms | > 100ms |
| `analytics_latency` p95 | < 5s | > 8s |
| `csv_export_latency` p95 | < 10s | > 15s |
| `error_rate` | < 1% | > 3% |
| `kv_hit_rate` | > 99% | — |
| `cron_errors` | — | > 10% |

## Grafana Cloud

Stream results for real-time dashboards and historical comparison:

1. Sign up at [grafana.com/products/cloud/k6](https://grafana.com/products/cloud/k6/)
2. Go to **Settings > API Tokens** and create a k6 Cloud API token
3. Add `K6_CLOUD_TOKEN` to `load-tests/.env.staging`
4. Run with `--out cloud` or `--cloud-exec`:

```bash
# Stream local results to cloud
./load-tests/run-k6.sh staging e2e-load.js

# Use cloud generators (distributed, for high RPS)
./load-tests/run-k6.sh staging e2e-load.js --cloud-exec
```

## Notes

- **k6 local limits**: A single laptop can sustain ~2K RPS. Use `--cloud-exec` for 5K+ RPS tests.
- **Multi-event bands**: e2e-load.js uses `LOADTEST-E1-`, `LOADTEST-E2-`, `LOADTEST-E3-` prefixes across 3 city events. Run `seed-multi-event` before testing.
- **Auth**: Admin/exporter scenarios require a seeded user. Run `seed-user` before testing.
- **KV hit rate**: Measured as redirects returning a `compassion.com` URL. If `kv_hit_rate` < 99%, re-run `seed-multi-event`.
- **Environment**: Tests target staging infrastructure using `LOADTEST-` prefixed data for easy isolation and cleanup.
- **queue_depth**: Gauge metric for observability — no threshold applied. Watch for continuous growth (indicates cron drain rate is insufficient).
