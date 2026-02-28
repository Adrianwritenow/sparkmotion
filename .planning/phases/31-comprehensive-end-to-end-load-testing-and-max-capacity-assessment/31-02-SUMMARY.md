---
phase: 31-comprehensive-end-to-end-load-testing-and-max-capacity-assessment
plan: "02"
subsystem: load-testing
tags: [k6, load-testing, e2e, performance, cloudflare-worker, analytics, redis]
dependency_graph:
  requires: ["31-01"]
  provides: ["e2e-load.js unified test script"]
  affects: []
tech_stack:
  added: []
  patterns:
    - "k6 ramping-arrival-rate for stepped-plateau load profiling"
    - "k6 constant-vus for sustained background scenario load"
    - "k6 constant-arrival-rate for periodic trigger scenarios"
    - "Tiered k6 thresholds (warn/fail) per SOW latency targets"
    - "NextAuth CSRF flow in k6 setup() for session cookie auth"
key_files:
  created:
    - load-tests/e2e-load.js
  modified: []
decisions:
  - "8 custom metrics declared (7 per SOW + error_rate): redirect_latency, kv_hit_rate, error_rate, analytics_latency, csv_export_latency, queue_depth, cron_flushed, cron_errors"
  - "queue_depth Gauge has no threshold — observability-only metric, final value read in summary"
  - "tappers startRate=500 then 2-min hold at each tier matches stepped-plateau spec exactly"
  - "sampleQueue guards on UPSTASH_URL/UPSTASH_TOKEN presence — optional Upstash credentials skip gracefully"
  - "Default export is empty stub — k6 requires default export even when all scenarios use exec"
  - "Both tasks written in single file creation pass — Tasks 1 and 2 were structurally inseparable (same output file)"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-02-28"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
---

# Phase 31 Plan 02: Unified E2E Load Test Script Summary

Single `load-tests/e2e-load.js` k6 script with 5 concurrent scenarios (tappers, admins, exporters, cron_trigger, queue_sampler) running stepped-plateau load from 500 to 10K RPS to measure cross-scenario contention under full production conditions.

## What Was Built

`load-tests/e2e-load.js` — A k6 unified end-to-end load test script that exercises every production component simultaneously:

- **tappers scenario** (`ramping-arrival-rate`): 7 stages stepping 500 → 1K → 2.5K → 5K → 7.5K → 10K RPS with 2-minute holds at each plateau, then 30s ramp-down. Distributes band IDs randomly across 3 KV prefixes (`LOADTEST-E1-`, `LOADTEST-E2-`, `LOADTEST-E3-`), each holding 200K bands. 50% of requests include UTM params to exercise the Worker URL construction path.

- **admins scenario** (`constant-vus`, 10 VUs, 13m): Fires 4 tRPC analytics queries per iteration (`kpis`, `velocityHistory`, `eventSummary`, `tapsByHour`) then sleeps 5s, simulating 10 admin dashboards polling concurrently with analytics reads contending against the flush-taps writes.

- **exporters scenario** (`constant-vus`, 2 VUs, 13m): Calls `analytics.exportTaps` every 30s, testing the heavy PostgreSQL export query under redirect load.

- **cron_trigger scenario** (`constant-arrival-rate`, 1/15s, 13m): Triggers the flush-taps HTTP endpoint with `Authorization: Bearer` header, accumulates `cron_flushed` Counter from JSON body, records `queue_depth` Gauge from `body.remaining`.

- **queue_sampler scenario** (`constant-arrival-rate`, 1/30s, 13m): POSTs Upstash REST pipeline `[["LLEN", "tap-log:pending"]]` and records result as `queue_depth` Gauge. Guards on env var presence — skips gracefully when Upstash credentials not configured.

## Metrics and Thresholds

| Metric | Type | Threshold (warn / fail) |
|---|---|---|
| `redirect_latency` | Trend | p95 < 50ms / p95 < 100ms |
| `analytics_latency` | Trend | p95 < 5s / p95 < 8s |
| `csv_export_latency` | Trend | p95 < 10s / p95 < 15s |
| `error_rate` | Rate | < 1% / < 3% |
| `kv_hit_rate` | Rate | > 99% |
| `cron_errors` | Rate | < 10% |
| `queue_depth` | Gauge | observability only — no threshold |
| `cron_flushed` | Counter | observability only — no threshold |

## Auth Flow

`setup()` implements the 2-step NextAuth CSRF flow (copied verbatim from the proven `analytics-load.js` pattern):
1. GET `/api/auth/csrf` — extracts `csrfToken` + CSRF cookies
2. POST `/api/auth/callback/credentials` — returns session cookie
3. Tries 4 possible NextAuth session cookie names; warns if none found

The session `{ cookie }` is passed to `runAdmin()` and `runExporter()` via k6's `data` parameter.

## Usage

```bash
# Local run (uses all env vars from .env.staging)
k6 run \
  -e WORKER_URL=https://sparkmotion.net \
  -e HUB_URL=https://geo.sparkmotion.net \
  -e ADMIN_URL=https://admin.sparkmotion.net \
  -e TEST_PASSWORD=xxx \
  -e LOADTEST_EVENT_ID=xxx \
  -e CRON_SECRET=xxx \
  -e UPSTASH_REDIS_REST_URL=xxx \
  -e UPSTASH_REDIS_REST_TOKEN=xxx \
  load-tests/e2e-load.js

# Cloud execution (Grafana Cloud generators)
./load-tests/run-k6.sh staging e2e-load.js --cloud-exec
```

## Deviations from Plan

None — plan executed exactly as written. Both tasks (scenario/metrics definitions and exec functions/setup/handleSummary) were implemented in a single file write since they are structurally inseparable (both write to the same output file). All 7 custom metrics from the SOW are present, plus `error_rate` which was defined in the existing `redirect-load.js` pattern.

## Self-Check: PASSED

- [x] `load-tests/e2e-load.js` created: 420 lines
- [x] Commit `cb22cae` exists: `feat(31-02): add unified e2e-load.js with 5 concurrent scenarios and stepped-plateau tappers`
- [x] 7 export functions: `setup`, `runTapper`, `runAdmin`, `runExporter`, `runCron`, `sampleQueue`, `handleSummary` + default
- [x] 5 scenario exec mappings: tappers, admins, exporters, cron_trigger, queue_sampler
- [x] Stepped plateau: 500/1K/2.5K/5K/7.5K/10K RPS at 2-minute holds
- [x] Tiered thresholds for redirect, analytics, CSV latency and error_rate
- [x] Multi-event band selection across LOADTEST-E1/E2/E3 prefixes
- [x] handleSummary writes to `load-tests/results/e2e-load-summary.json`
