---
phase: 33-build-audit-logging-ui-page-for-soc2-compliance
plan: 02
subsystem: ui
tags: [tanstack-table, trpc, audit-logs, soc2, admin, shadcn, react-day-picker, date-fns, csv-export]

# Dependency graph
requires:
  - phase: 33-build-audit-logging-ui-page-for-soc2-compliance
    plan: 01
    provides: auditLogs tRPC router (list, stats, export), AuditLog sidebar nav item

provides:
  - Complete /audit-logs page in admin app with server-side paginated table, filter bar, detail sheet, stat cards, and CSV export
  - AuditLogsPage server component with ADMIN auth guard
  - AuditLogsContent client orchestrator managing filter state
  - AuditStats: 4 stat cards (Total Events 24h, Failed Logins 7d, Deletions 7d, Most Active User)
  - AuditFilterBar: Calendar+Popover date range, 3 Select dropdowns, 4 quick presets, clear button
  - AuditTable: TanStack table with manualPagination, 5 columns, color-coded action badges, row click, responsive mobile cards, 25/50/100 page size
  - AuditDetailSheet: auth event vs mutation diff view, collapsible Technical Details
  - AuditExportButton: CSV download of filtered results via trpc.auditLogs.export
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - AuditRow type defined in audit-logs-content.tsx and imported by table and sheet (single source of truth for row shape)
    - getActionBadge helper exported from audit-table.tsx and imported by audit-detail-sheet.tsx (avoids duplicating badge logic)
    - keepPreviousData: true on list query prevents table flicker during pagination
    - diffValues() computes added/removed/changed keys between oldValue and newValue records for diff panel
    - Responsive: hidden lg:block for desktop table, lg:hidden for mobile card list (Phase 20 pattern)
    - isRecord() type guard safely narrows Json? unknown to Record<string,unknown> before diff rendering

key-files:
  created:
    - apps/admin/src/app/(dashboard)/audit-logs/page.tsx
    - apps/admin/src/components/audit-logs/audit-logs-content.tsx
    - apps/admin/src/components/audit-logs/audit-stats.tsx
    - apps/admin/src/components/audit-logs/audit-filter-bar.tsx
    - apps/admin/src/components/audit-logs/audit-table.tsx
    - apps/admin/src/components/audit-logs/audit-detail-sheet.tsx
    - apps/admin/src/components/audit-logs/audit-export-button.tsx
  modified: []

key-decisions:
  - "keepPreviousData: true (not placeholderData arrow function) — tRPC v10 overload types require PlaceholderDataFunction<T> with args, not () => prev"
  - "AuditRow type defined once in audit-logs-content.tsx — table and sheet import it to avoid duplicating Prisma output types"
  - "getActionBadge exported from audit-table.tsx so detail sheet reuses badge coloring without re-declaring the function"
  - "isRecord() type guard before diff rendering — row.oldValue/newValue are Json? (unknown), must narrow to Record before Object.keys()"
  - "Auth events (action.startsWith('auth.')) skip the diff section entirely — no newValue diff for auth event types"
  - "diffValues() uses allKeys = union of old+new keys — captures added and removed fields in mutations"
  - "AuditExportButton uses utils.auditLogs.export.fetch() not useMutation — export is a query procedure (GET), fetch() is the imperative call pattern"

patterns-established:
  - "Server component page shell with force-dynamic + ADMIN redirect guard, delegates all client state to Content component"
  - "Content orchestrator pattern: single client component owns all filter state, passes derived ISO strings down to child components"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-02-28
---

# Phase 33 Plan 02: Audit Logging UI Page Summary

**Complete SOC 2 audit log UI in admin app: TanStack server-paginated table with color-coded action badges, Calendar+Popover date range picker, auth-vs-mutation detail Sheet, and CSV export — 7 new files, TypeScript clean**

## Performance

- **Duration:** 20 min
- **Started:** 2026-02-28T18:35:00Z
- **Completed:** 2026-02-28T18:55:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Audit logs page at `/audit-logs` with server-side ADMIN auth guard and `force-dynamic`
- TanStack Table with `manualPagination: true`, 5 columns, and 25/50/100 rows-per-page selector
- Filter bar with Calendar+Popover date range, 3 Select dropdowns (User/Action/Resource), 4 quick presets, clear button, and inline export
- Detail Sheet with conditional rendering: auth events show contextual detail, mutations show side-by-side diff with yellow highlights for changed fields
- CSV export fetches up to 10K rows of filtered results and downloads as `audit-log-YYYY-MM-DD.csv`

## Task Commits

1. **Task 1: Page shell, content orchestrator, stat cards, filter bar** - `4573fa5` (feat)
2. **Task 2: Data table, detail sheet, CSV export button** - `4a7c2d4` (feat)

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/audit-logs/page.tsx` - Server component, force-dynamic, ADMIN auth guard
- `apps/admin/src/components/audit-logs/audit-logs-content.tsx` - Client orchestrator, all filter state, tRPC queries
- `apps/admin/src/components/audit-logs/audit-stats.tsx` - 4 StatCards: Total Events 24h, Failed Logins 7d, Deletions 7d, Most Active User
- `apps/admin/src/components/audit-logs/audit-filter-bar.tsx` - Date range picker, User/Action/Resource dropdowns, quick presets, clear button, export button
- `apps/admin/src/components/audit-logs/audit-table.tsx` - TanStack table, 5 columns, color-coded badges, pagination, responsive mobile cards
- `apps/admin/src/components/audit-logs/audit-detail-sheet.tsx` - Side-panel with auth vs mutation views, diff, collapsible tech details
- `apps/admin/src/components/audit-logs/audit-export-button.tsx` - CSV export via trpc.auditLogs.export.fetch(), sonner toast

## Decisions Made

- `keepPreviousData: true` instead of `placeholderData: (prev) => prev` — tRPC v10's overload signature for `placeholderData` requires `PlaceholderDataFunction<T>` with arguments, not a zero-arg arrow function; `keepPreviousData` is the correct API
- `AuditRow` type defined in `audit-logs-content.tsx` and imported by table and sheet to avoid duplicating the Prisma return shape
- `getActionBadge` exported from `audit-table.tsx` so `audit-detail-sheet.tsx` reuses the same badge coloring without a duplicate function
- `isRecord()` type guard before diff rendering — `row.oldValue`/`row.newValue` are `Json?` (typed as `unknown`), so must narrow to `Record<string, unknown>` before `Object.keys()`
- Auth events detected with `action.startsWith("auth.")` — skip diff section, show contextual auth detail card instead
- `utils.auditLogs.export.fetch()` used for export (not `useMutation`) — export procedure is a `query`, so `fetch()` is the imperative call pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `placeholderData` type error in content orchestrator**
- **Found during:** Task 1 (TypeScript compilation check after writing audit-logs-content.tsx)
- **Issue:** `placeholderData: (prev) => prev` — tRPC v10 overload for `placeholderData` requires the callback to accept at least one argument (previous data + hint), not zero args. TS2769 no overload matches.
- **Fix:** Changed to `keepPreviousData: true` which is the correct React Query v4 API for this pattern
- **Files modified:** `apps/admin/src/components/audit-logs/audit-logs-content.tsx`
- **Verification:** `tsc --noEmit` passes cleanly
- **Committed in:** `4573fa5` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript type error)
**Impact on plan:** Correctness fix caught immediately by compiler. No scope changes.

## Issues Encountered

None beyond the TypeScript fix above.

## Next Phase Readiness

- Audit logs UI fully wired to tRPC backend from Plan 01
- Page accessible at `/audit-logs` in admin app, requires ADMIN session
- SOC 2 auditor flow complete: view → filter → inspect detail → export CSV
- No further plans in Phase 33 — phase complete

## Self-Check: PASSED

- FOUND: apps/admin/src/app/(dashboard)/audit-logs/page.tsx
- FOUND: apps/admin/src/components/audit-logs/audit-logs-content.tsx
- FOUND: apps/admin/src/components/audit-logs/audit-stats.tsx
- FOUND: apps/admin/src/components/audit-logs/audit-filter-bar.tsx
- FOUND: apps/admin/src/components/audit-logs/audit-table.tsx
- FOUND: apps/admin/src/components/audit-logs/audit-detail-sheet.tsx
- FOUND: apps/admin/src/components/audit-logs/audit-export-button.tsx
- FOUND commit: 4573fa5
- FOUND commit: 4a7c2d4
- TypeScript: tsc --noEmit PASSED (zero errors)

---
*Phase: 33-build-audit-logging-ui-page-for-soc2-compliance*
*Completed: 2026-02-28*
