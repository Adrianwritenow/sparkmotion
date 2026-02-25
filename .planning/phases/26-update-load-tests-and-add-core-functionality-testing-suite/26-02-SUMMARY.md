---
phase: 26-update-load-tests-and-add-core-functionality-testing-suite
plan: 02
subsystem: testing
tags: [vitest, trpc, prisma, vitest-mock-extended, unit-testing, authorization]

# Dependency graph
requires:
  - phase: 26-01
    provides: test-mocks.ts prismaMock singleton, createTestCaller factory, Vitest infrastructure
provides:
  - Unit tests for events tRPC router (11 tests)
  - Unit tests for bands tRPC router (13 tests)
  - Unit tests for campaigns tRPC router (11 tests)
  - Unit tests for organizations tRPC router (9 tests)
affects:
  - Phase 26-03 (any remaining router test plans)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - vi.mock('@sparkmotion/database', async () => { const { prismaMock } = await import('../test-mocks'); ... }) — async factory avoids circular import with test-utils.ts which imports appRouter
    - prismaMock imported from test-mocks.ts (not test-utils.ts) in vi.mock factories to break circular dependency chain
    - vi.mock('../lib/engagement', ...) required for routers that call getEventEngagement (events.ts, campaigns.ts) because engagement.ts also calls db.$queryRaw

key-files:
  created:
    - packages/api/src/routers/events.test.ts
    - packages/api/src/routers/bands.test.ts
    - packages/api/src/routers/campaigns.test.ts
    - packages/api/src/routers/organizations.test.ts

key-decisions:
  - "vi.mock factory imports from test-mocks.ts (not test-utils.ts) — test-utils.ts imports appRouter which imports all routers, causing circular dependency if used in async vi.mock factory"
  - "getEventEngagement (lib/engagement.ts) mocked per-test-file because it calls db.$queryRaw directly — unmocked it would hang waiting for DB"
  - "campaigns.update/delete CUSTOMER ownership throws plain Error (not TRPCError) — tests use rejects.toThrow('Forbidden') not toMatchObject({ code: 'FORBIDDEN' })"

patterns-established:
  - "Pattern: async vi.mock factory — vi.mock('@sparkmotion/database', async () => { const { prismaMock } = await import('../test-mocks'); return { db: prismaMock, Prisma: {...} } })"
  - "Pattern: engagement mock — vi.mock('../lib/engagement', () => ({ getEventEngagement: vi.fn().mockResolvedValue(new Map()) })) for routers that use engagement calculations"

requirements-completed: []

# Metrics
duration: 30min
completed: 2026-02-24
---

# Phase 26 Plan 02: Events, Bands, Campaigns, Organizations Router Tests Summary

**44 unit tests across 4 tRPC routers covering ADMIN/CUSTOMER role enforcement, org-scoping, happy-path CRUD, and unauthenticated rejection**

## Performance

- **Duration:** 30 min
- **Started:** 2026-02-24T01:01:43Z
- **Completed:** 2026-02-24T01:32:00Z
- **Tasks:** 2
- **Files modified:** 4 created

## Accomplishments
- Created events.test.ts with 11 tests: ADMIN/CUSTOMER list scoping, byId currentMode detection, create/update/delete CRUD, unauthenticated rejection
- Created bands.test.ts with 13 tests: list, listAll scoping, uploadBatch, register upsert, activityFeed, bulkReassign, auth enforcement
- Created campaigns.test.ts with 11 tests: ADMIN/CUSTOMER list scoping, byId with engagement, create/update/delete, org ownership enforcement
- Created organizations.test.ts with 9 tests: ADMIN-only list, byId, update (adminProcedure), updateName CUSTOMER scoping
- All 80 tests pass across 9 test files (including prior Phase 26-03 analytics/windows/tags/infrastructure/users tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create events and bands router tests** - `02635a4` (test)
2. **Task 2: Create campaigns and organizations router tests** - `b1a5717` (test)

## Files Created/Modified
- `packages/api/src/routers/events.test.ts` - 11 tests for events router (list ADMIN/CUSTOMER scoping, byId, create/update/delete, unauthenticated)
- `packages/api/src/routers/bands.test.ts` - 13 tests for bands router (list, listAll, uploadBatch, register, activityFeed, bulkReassign)
- `packages/api/src/routers/campaigns.test.ts` - 11 tests for campaigns router (list, byId, create/update/delete, org ownership)
- `packages/api/src/routers/organizations.test.ts` - 9 tests for organizations router (list ADMIN-only, byId, update adminProcedure, updateName scoping)

## Decisions Made
- `vi.mock` factory uses `async import('../test-mocks')` instead of `test-utils` to avoid circular dependency — `test-utils` imports `appRouter` which imports all routers, causing a deadlock when the mock factory tries to import it while the router is being initialized
- `lib/engagement.ts` must be mocked separately because it calls `db.$queryRaw` directly — without this mock, `events.list` and `campaigns.list` hang waiting for the real DB
- `campaigns.update/delete` ownership checks throw plain `Error` (not `TRPCError`) when CUSTOMER accesses wrong org — tests check `rejects.toThrow('Forbidden')` not `code: 'FORBIDDEN'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added test-mocks.ts as circular-dependency-safe prismaMock source**
- **Found during:** Task 1 (events.test.ts)
- **Issue:** The async `vi.mock('@sparkmotion/database', async () => await import('../test-utils'))` pattern caused a deadlock — test-utils.ts imports appRouter which imports events.ts which imports @sparkmotion/database, creating a circular import chain during mock resolution
- **Fix:** The pre-existing `test-mocks.ts` (created in Phase 26-03 before this plan) serves as the circular-dependency-safe mock source. The vi.mock factory imports from `test-mocks.ts` which has no router imports
- **Files modified:** None — test-mocks.ts was already in place from prior execution
- **Committed in:** 02635a4 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Mocked lib/engagement.ts in events and campaigns test files**
- **Found during:** Task 1 (events.test.ts)
- **Issue:** Plan specified mocking @sparkmotion/database and @sparkmotion/redis, but did not mention that events.ts and campaigns.ts also import getEventEngagement from ../lib/engagement which calls db.$queryRaw internally
- **Fix:** Added `vi.mock('../lib/engagement', () => ({ getEventEngagement: vi.fn().mockResolvedValue(new Map()) }))` to events.test.ts and campaigns.test.ts
- **Files modified:** packages/api/src/routers/events.test.ts, packages/api/src/routers/campaigns.test.ts
- **Verification:** Tests pass without real DB connections
- **Committed in:** 02635a4, b1a5717

---

**Total deviations:** 2 auto-fixed (both Rule 2 - Missing Critical)
**Impact on plan:** Both fixes necessary for tests to run without real external connections. No scope creep.

## Issues Encountered
- `vi.mock` hoist + ESM circular import: using `require()` inside `vi.hoisted` fails because `vitest-mock-extended` is ESM-only; async `vi.mock` factory with `test-utils` import causes deadlock. Resolution: import from `test-mocks.ts` (no router deps) inside async factory, import from `test-utils.ts` for test assertions.
- Test isolation: running events.test.ts in isolation produced `caller.events is undefined` intermittently before `test-utils.ts` was correctly stabilized with `createCallerFactory()(appRouter)` pattern.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 target routers have unit test coverage
- 80 total tests passing across the full API test suite
- Pattern established for all future router tests: async vi.mock factory with test-mocks.ts import

## Self-Check: PASSED

- events.test.ts: FOUND at packages/api/src/routers/events.test.ts
- bands.test.ts: FOUND at packages/api/src/routers/bands.test.ts
- campaigns.test.ts: FOUND at packages/api/src/routers/campaigns.test.ts
- organizations.test.ts: FOUND at packages/api/src/routers/organizations.test.ts
- SUMMARY.md: FOUND
- Commit 02635a4: FOUND (Task 1 — events and bands tests)
- Commit b1a5717: FOUND (Task 2 — campaigns and organizations tests)

---
*Phase: 26-update-load-tests-and-add-core-functionality-testing-suite*
*Completed: 2026-02-24*
