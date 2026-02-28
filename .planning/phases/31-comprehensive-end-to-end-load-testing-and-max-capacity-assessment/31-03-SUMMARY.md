---
phase: 31
plan: "03"
subsystem: load-testing
tags: [k6, load-testing, cleanup, validation]
dependency_graph:
  requires: ["31-02"]
  provides: ["validated-e2e-load-script", "clean-load-test-directory"]
  affects: []
tech_stack:
  added: []
  patterns: ["k6-inspect-validation", "unified-e2e-entrypoint"]
key_files:
  created: []
  modified:
    - load-tests/README.md
  deleted:
    - load-tests/redirect-load.js
    - load-tests/analytics-load.js
    - load-tests/csv-export-load.js
    - load-tests/hub-redirect-load.js
    - load-tests/geo-routing-load.js
    - load-tests/upstash-pipeline.js
decisions:
  - "k6 inspect with dummy env vars validates script syntax since env guards run at module init time"
  - "Auth warning in staging dry-run is expected graceful behavior — script returns empty cookie string and continues"
  - "README rewritten to reflect unified e2e-load.js architecture with 5-scenario table and updated thresholds"
metrics:
  duration_minutes: 4
  tasks_completed: 2
  tasks_total: 3
  files_created: 0
  files_modified: 1
  files_deleted: 6
  completed_date: "2026-02-28"
---

# Phase 31 Plan 03: Validate, Clean, Prep Cloud Run Summary

e2e-load.js validated via k6 inspect (5 scenarios confirmed, 8 custom metrics, exit 0), 6 superseded k6 scripts deleted, README rewritten for unified single-entrypoint architecture.

## What Was Done

**Task 1: Validate e2e-load.js locally**

- Ran `k6 inspect` with staging env vars — exited 0, all 5 scenarios detected (`tappers`, `admins`, `exporters`, `cron_trigger`, `queue_sampler`)
- All 6 custom metric thresholds present (`redirect_latency`, `analytics_latency`, `csv_export_latency`, `error_rate`, `kv_hit_rate`, `cron_errors`)
- Quick dry-run (`k6 run --duration 15s`) confirmed script initializes without JavaScript errors
- Auth warning ("No session cookie found") is documented graceful behavior — script continues with empty cookie and does not throw
- No code changes needed — e2e-load.js was already valid

**Task 2: Delete old isolated test scripts**

- Deleted 6 files: redirect-load.js, analytics-load.js, csv-export-load.js, hub-redirect-load.js, geo-routing-load.js, upstash-pipeline.js
- Verified only `e2e-load.js` remains as a `.js` file in load-tests/
- `flush-taps-bench.ts` (standalone cron benchmark) preserved
- `run-k6.sh` references to old scripts are only in comment lines — no functional references remain
- README.md rewritten: 5-scenario architecture table, updated thresholds, unified execution commands

**Task 3: Checkpoint — awaiting user Grafana Cloud run**

- Paused at checkpoint:human-verify per plan (autonomous: false)
- User must run `seed-multi-event` (if not done) then `./load-tests/run-k6.sh staging e2e-load.js --cloud-exec`

## Deviations from Plan

**1. [Rule 1 - Observation] k6 --duration overrides scenario-based config**

- **Found during:** Task 1 local dry-run
- **Issue:** `k6 run --duration 30s` overrides all scenario config entirely, collapsing to a single default VU loop. This is expected k6 behavior. Plan's suggested command was informational, not authoritative.
- **Fix:** Used `k6 inspect` (the plan's actual verify step) to confirm all 5 scenarios. Script structure validated via inspect rather than execution.
- **Impact:** None — inspect is the correct validation tool for scenario-based scripts

**2. [Observation] Auth warning in dry-run**

- **Observed during:** Task 1 local dry-run
- **Issue:** CSRF login to `sparkmotion-admin-blue.vercel.app` returns CredentialsSignin error. Root cause: auth callback URL cookie points to `admin.sparkmotion.net` (custom domain) while requests go to the Vercel preview URL. This is a staging infrastructure URL routing edge case, not a script bug.
- **Fix:** Not needed — e2e-load.js already handles missing session gracefully (returns `{ cookie: "" }`, logs warning, continues). This is exactly the documented behavior for the case where staging auth is unavailable.
- **Impact:** Admin and exporter scenarios will return 401s during local dry-runs against preview URLs. Cloud run uses the same ADMIN_URL so this will affect cloud run too — user should verify admin auth works against `admin.sparkmotion.net` before cloud run.

## Validation Results

```
k6 inspect exit code: 0
Scenarios detected: 5 (tappers, admins, exporters, cron_trigger, queue_sampler)
Thresholds: 6 defined (redirect_latency, analytics_latency, csv_export_latency, error_rate, kv_hit_rate, cron_errors)
Custom metrics: 8 (redirect_latency, error_rate, kv_hit_rate, analytics_latency, csv_export_latency, queue_depth, cron_flushed, cron_errors)
Default export: present (empty stub for k6 requirement)
handleSummary: present (writes to load-tests/results/e2e-load-summary.json)
```

## Directory State After Task 2

```
load-tests/
  e2e-load.js          ← unified k6 script (5 scenarios)
  seed.ts              ← data seeder (unchanged)
  flush-taps-bench.ts  ← standalone cron benchmark (unchanged)
  run-k6.sh            ← runner wrapper (unchanged)
  README.md            ← updated for unified architecture
  ANALYSIS-PLAN.md     ← historical analysis doc
  GAP-REPORT.md        ← historical gap report
  package.json         ← package deps
  results/             ← result JSON files
  .env.staging         ← staging credentials
  .env.production      ← production credentials
  .env.example         ← template
```

## Pending: Task 3 (Grafana Cloud Run)

User action required:

1. Verify `seed-multi-event` is complete (3 events × 200K bands in KV + staging Postgres)
2. Run: `./load-tests/run-k6.sh staging e2e-load.js --cloud-exec`
3. Review results in Grafana Cloud dashboard

Key metrics to watch:
- At which RPS tier does `redirect_latency` p95 exceed 50ms?
- Does `queue_depth` stabilize or grow continuously?
- Does `analytics_latency` degrade under peak redirect load?
- Is `kv_hit_rate` > 99%?

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| load-tests/e2e-load.js exists | FOUND |
| load-tests/flush-taps-bench.ts preserved | FOUND |
| redirect-load.js deleted | DELETED |
| analytics-load.js deleted | DELETED |
| csv-export-load.js deleted | DELETED |
| hub-redirect-load.js deleted | DELETED |
| geo-routing-load.js deleted | DELETED |
| upstash-pipeline.js deleted | DELETED |
| Commit a2808c0 exists | FOUND |
