---
phase: 33-build-audit-logging-ui-page-for-soc2-compliance
plan: 01
subsystem: api
tags: [trpc, prisma, audit-logs, soc2, admin, sidebar]

# Dependency graph
requires:
  - phase: 32-soc2-backend-compliance-hardening
    provides: AuditLog model in Prisma schema, auditLog middleware writing to DB
provides:
  - auditLogs tRPC router with list (paginated), stats (4 metrics), and export (10K-capped) procedures
  - Audit Log sidebar nav item in admin app
affects: [33-02, 33-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - buildWhere helper extracted for shared filter logic across list and export procedures
    - resolveUsers helper does single db.user.findMany for all unique userIds (N+1 prevention)
    - db.$transaction for parallel count queries in list and stats procedures

key-files:
  created:
    - packages/api/src/routers/audit-logs.ts
  modified:
    - packages/api/src/root.ts
    - apps/admin/src/components/layout/sidebar.tsx

key-decisions:
  - "AuditLog has no FK relation to User — userId is plain String?; must resolve users via separate db.user.findMany with in filter"
  - "buildWhere helper shared between list and export so filter logic stays DRY"
  - "resolveUsers deduplicated userIds before querying to avoid passing duplicates to SQL IN clause"
  - "action filter uses contains match (partial path like 'create' matches 'events.create'); resource uses exact match"
  - "failedLogins7d uses action: { in: [...] } not contains to match exact auth failure action strings"
  - "stats uses db.$transaction for 3 count queries; groupBy is separate (Prisma restriction)"

patterns-established:
  - "Server-side user resolution pattern: extract userIds from rows, single findMany, build Map for O(1) lookup"

requirements-completed: []

# Metrics
duration: 10min
completed: 2026-02-28
---

# Phase 33 Plan 01: auditLogs tRPC Router Summary

**auditLogs tRPC router with server-side paginated list, 4-metric stats summary, and 10K-capped CSV export — all adminProcedure with separate user resolution via non-FK userId**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-28T18:23:00Z
- **Completed:** 2026-02-28T18:33:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `audit-logs.ts` router with list, stats, and export procedures all gated via adminProcedure
- Server-side user resolution using separate `db.user.findMany` (AuditLog has no FK relation to User)
- Registered `auditLogs` router in root.ts and added Audit Log nav item to admin sidebar with ClipboardList icon

## Task Commits

1. **Task 1: Create auditLogs tRPC router** - `ba9c192` (feat)
2. **Task 2: Register router and add sidebar nav item** - `90d8eb7` (feat)

## Files Created/Modified

- `packages/api/src/routers/audit-logs.ts` - auditLogsRouter with list (paginated+user-resolved), stats (4 metrics), export (10K-capped)
- `packages/api/src/root.ts` - auditLogsRouter imported and registered as `auditLogs`
- `apps/admin/src/components/layout/sidebar.tsx` - ClipboardList import added, Audit Log nav item added after Users

## Decisions Made

- `buildWhere` helper extracted and shared between `list` and `export` procedures to avoid duplicating filter logic
- `resolveUsers` deduplicates userIds before querying so SQL IN clause has no repeated values
- `action` filter uses `contains` for partial matching (e.g. "delete" matches "events.delete"), but `failedLogins7d` stats uses `in` to match exact action strings `auth.login_failure` and `auth.lockout`
- `db.$transaction` wraps the three count queries in `stats` for atomicity; `groupBy` runs separately as Prisma does not support groupBy inside transactions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error in buildWhere return type**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** Return type `Parameters<typeof db.auditLog.findMany>[0]["where"]` resolved to `undefined`-inclusive union, causing TS2339
- **Fix:** Changed return type to `Prisma.AuditLogWhereInput` — explicit and correct
- **Files modified:** `packages/api/src/routers/audit-logs.ts`
- **Verification:** `tsc --noEmit` passes cleanly
- **Committed in:** `ba9c192` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed possibly-undefined access on topUserGroups array**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** TS2532 on `topUserGroups[0].userId` and `topUserGroups[0]._count.id` — noUncheckedIndexedAccess not enabled but strict mode still flags the pattern
- **Fix:** Destructured `const topGroup = topUserGroups[0]` and guarded with `if (topGroup && topGroup.userId)`
- **Files modified:** `packages/api/src/routers/audit-logs.ts`
- **Verification:** `tsc --noEmit` passes cleanly
- **Committed in:** `ba9c192` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug, both TypeScript type errors caught during compilation check)
**Impact on plan:** Both fixes were correctness requirements caught immediately by the compiler. No scope changes.

## Issues Encountered

None beyond the two TypeScript compilation errors auto-fixed above.

## Next Phase Readiness

- `auditLogs.list`, `auditLogs.stats`, and `auditLogs.export` procedures ready for UI consumption in Plan 02
- Sidebar nav item `/audit-logs` route ready to be wired up to the page component in Plan 02
- TypeScript types exported via `AppRouter` for full end-to-end type safety in client components

---
*Phase: 33-build-audit-logging-ui-page-for-soc2-compliance*
*Completed: 2026-02-28*
