---
phase: 32-soc-2-backend-compliance-hardening
plan: 02
subsystem: database
tags: [prisma, postgresql, cron, data-retention, soc2, taplog, analytics]

# Dependency graph
requires:
  - phase: 32-01
    provides: AuditLog model, SOC 2 audit infrastructure baseline
provides:
  - AnalyticsSummary Prisma model for pre-aggregated daily tap counts
  - data-retention cron that aggregates 90-day-old TapLogs and deletes raw records
  - PasswordResetToken cleanup (expired + used) in same cron
  - vercel.json daily schedule at 3 AM UTC
affects: [analytics, data-retention, soc2, compliance, reporting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Denormalized summary table (no FK) to survive event/window deletion
    - Non-nullable empty string instead of NULL for PostgreSQL unique constraints
    - Idempotent upsert via @@unique constraint for safe re-runs
    - Raw SQL GROUP BY aggregation before batch delete for consistency

key-files:
  created:
    - apps/hub/src/app/api/cron/data-retention/route.ts
  modified:
    - packages/database/prisma/schema.prisma
    - apps/hub/vercel.json

key-decisions:
  - "AnalyticsSummary uses @db.Date for day-level granularity — sub-day precision unnecessary for historical analytics"
  - "windowId and redirectUrl as non-nullable String @default(\"\") — NULL != NULL in PostgreSQL unique constraints would allow duplicate rows; empty string represents no window/no specific URL"
  - "@@unique([date, eventId, windowId, redirectUrl]) enables idempotent upsert-on-conflict for safe re-runs and restart recovery"
  - "No FK relations to Event/EventWindow — denormalized summary table; referenced events/windows may be deleted independently"
  - "Aggregation query runs before delete — if delete fails, next run will re-aggregate (idempotent upsert adds to existing counts)"

patterns-established:
  - "Data retention pattern: aggregate-then-delete with idempotent upserts for safe re-runs"
  - "Cron auth: CRON_SECRET bearer token check matching flush-taps pattern"

requirements-completed: []

# Metrics
duration: 28min
completed: 2026-02-28
---

# Phase 32 Plan 02: AnalyticsSummary Schema + Data Retention Cron Summary

**AnalyticsSummary Prisma model with daily data-retention cron aggregating 90-day-old TapLogs into pre-aggregated summaries and cleaning expired PasswordResetTokens**

## Performance

- **Duration:** 28 min
- **Started:** 2026-02-28T16:47:16Z
- **Completed:** 2026-02-28T17:15:18Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- AnalyticsSummary model added to Prisma schema with @db.Date, non-nullable empty-string defaults for windowId/redirectUrl, @@unique constraint, and indexes — pushed to database
- data-retention cron route aggregates expired TapLogs via raw SQL GROUP BY, upserts summaries idempotently, deletes raw records, and cleans up expired/used PasswordResetTokens
- vercel.json updated with `0 3 * * *` daily schedule (3 AM UTC) for data-retention cron

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AnalyticsSummary model to Prisma schema** - `d8129a2` (feat)
2. **Task 2: Create data-retention cron route** - `952a748` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `packages/database/prisma/schema.prisma` - AnalyticsSummary model added after AuditLog
- `apps/hub/src/app/api/cron/data-retention/route.ts` - Daily cron: aggregate + delete TapLogs, clean tokens
- `apps/hub/vercel.json` - Added data-retention cron at `0 3 * * *`

## Decisions Made
- `windowId` and `redirectUrl` as `String @default("")` (not nullable) — PostgreSQL treats NULL != NULL in unique constraints, which would allow duplicate rows. Empty string represents "no window" or "no specific URL".
- No FK relations on AnalyticsSummary — denormalized summary table allows event/window deletion without cascading effect on historical aggregates.
- Aggregation step runs before deletion — if the delete fails, the next cron run re-aggregates safely via idempotent upsert (tapCount increments on conflict).
- `0 3 * * *` schedule (3 AM UTC) — off-peak window minimizes production impact.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. CRON_SECRET env var already required by existing flush-taps cron.

## Next Phase Readiness

- Phase 32 Plan 02 complete. All 4 Phase 32 plans are now complete.
- AnalyticsSummary table is ready for use by analytics queries once raw TapLogs begin aging out at 90 days.
- data-retention cron will fire automatically once deployed with existing CRON_SECRET env var.

---
*Phase: 32-soc-2-backend-compliance-hardening*
*Completed: 2026-02-28*
