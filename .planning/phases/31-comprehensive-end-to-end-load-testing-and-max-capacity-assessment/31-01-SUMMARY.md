---
phase: 31-comprehensive-end-to-end-load-testing-and-max-capacity-assessment
plan: "01"
subsystem: load-tests
tags: [seed, multi-event, cloudflare-kv, postgresql, load-testing]
dependency_graph:
  requires: []
  provides: [seed-multi-event-command, multi-event-kv-cleanup]
  affects: [load-tests/seed.ts]
tech_stack:
  added: []
  patterns: [idempotent-seed, kv-bulk-api, db-batch-writes, gaussian-tap-distribution]
key_files:
  created: []
  modified:
    - load-tests/seed.ts
decisions:
  - "writeKVBatch() extracted as shared helper to avoid duplicating 30-line CF bulk API block across 3 events"
  - "Tap logs seeded for first event only (LT Event Nashville) to avoid Neon storage overrun — per Research open question 3"
  - "Safety gate startsWith(LT ) check already covers MULTI_EVENTS names (all prefixed with LT Event)"
  - "totalKvKeys in cleanup updated to BAND_COUNT + geo + (MULTI_EVENTS.length * BAND_COUNT) for accurate log output"
metrics:
  duration: "2m 24s"
  completed: "2026-02-28"
  tasks_completed: 2
  files_modified: 1
---

# Phase 31 Plan 01: Multi-Event Seed Command Summary

Added `seed-multi-event` command to `load-tests/seed.ts` that creates 3 concurrent events (Nashville, Dallas, Denver) with 200K bands each — 600K total bands across PostgreSQL and Cloudflare KV — for realistic multi-event contention testing in the e2e load test (Plan 02).

## What Was Built

### New Constants

Added `MULTI_EVENTS` array with 3 event configs (name, prefix, city, state, lat, lng) after existing GEO_CITIES:

```typescript
const MULTI_EVENTS = [
  { name: "LT Event Nashville", prefix: "LOADTEST-E1-", city: "Nashville", state: "TN", lat: 36.1627, lng: -86.7816 },
  { name: "LT Event Dallas",    prefix: "LOADTEST-E2-", city: "Dallas",    state: "TX", lat: 32.7767, lng: -96.7970 },
  { name: "LT Event Denver",    prefix: "LOADTEST-E3-", city: "Denver",    state: "CO", lat: 39.7392, lng: -104.9903 },
];
```

### New Functions

**`writeKVBatch(prefix, eventId, accountId, apiToken, namespaceId, start)`** — Shared helper that writes 200K KV entries for a given prefix using the CF bulk API in 10K batches with progress logging.

**`seedMultiEvent()`** — Orchestrates 3-event seeding:
1. Ensure loadtest org exists (reuse existing pattern)
2. For each event: findFirst/create, upsert LIVE window, create 200K bands (idempotent), write 200K KV entries
3. Create 600K tap logs for the first event only (Gaussian distribution, same as seedPostgres)
4. Registered in COMMANDS map as `"seed-multi-event"`

### Updated Cleanup

- Updated `totalKvKeys` to include `MULTI_EVENTS.length * BAND_COUNT` in pre-cleanup log
- Added deletion loop for all 3 multi-event KV prefixes (LOADTEST-E1/E2/E3) using CF bulk DELETE API
- Safety gate `startsWith("LT ")` already covers all multi-event names — no change needed

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `c34344c` | feat(31-01): add seed-multi-event command for 3-event 600K band seeding |
| Task 2 | `3c918a0` | feat(31-01): update cleanup to delete multi-event KV keys |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `load-tests/seed.ts` modified — FOUND
- `c34344c` commit — FOUND (git log confirmed)
- `3c918a0` commit — FOUND (git log confirmed)
- `seedMultiEvent` defined + registered — 2 occurrences confirmed
- `LOADTEST-E1-`, `LOADTEST-E2-`, `LOADTEST-E3-` present — 3 occurrences confirmed
- `seed-multi-event` in COMMANDS map — confirmed
- Cleanup references MULTI_EVENTS at lines 881 and 933 — confirmed
- TypeScript compiles with no errors — confirmed (with esModuleInterop; bcrypt default export was pre-existing config issue unrelated to our changes)
