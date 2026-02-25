---
phase: 26-update-load-tests-and-add-core-functionality-testing-suite
plan: 03
subsystem: testing
tags: [vitest, trpc, prisma, mocking, github-actions, ci]

# Dependency graph
requires:
  - phase: 26-update-load-tests-and-add-core-functionality-testing-suite
    plan: 01
    provides: "Vitest infrastructure, test-utils.ts, test-mocks.ts singleton, test-setup.ts auth mock"

provides:
  - "Unit tests for analytics, windows, tags, infrastructure, and users tRPC routers (60 tests total across all 7 router test files)"
  - "GitHub Actions CI workflow running pnpm turbo test on pull requests to main"

affects:
  - "All future tRPC router additions should follow this module-level vi.mock pattern"
  - "CI enforces test passing on every PR to main"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level async vi.mock factory importing prismaMock from test-mocks.ts (avoids TDZ)"
    - "adminProcedure throws FORBIDDEN for both unauthenticated and non-ADMIN users"
    - "Per-router redis mock shape matches what each router actually imports"

key-files:
  created:
    - packages/api/src/routers/analytics.test.ts
    - packages/api/src/routers/windows.test.ts
    - packages/api/src/routers/tags.test.ts
    - packages/api/src/routers/infrastructure.test.ts
    - packages/api/src/routers/users.test.ts
    - .github/workflows/ci.yml
  modified:
    - packages/api/src/routers/infrastructure.test.ts

key-decisions:
  - "adminProcedure checks !ctx.user || role !== ADMIN in one middleware — unauthenticated callers receive FORBIDDEN (not UNAUTHORIZED); test expectations updated to match"
  - "CI uses pnpm/action-setup@v4 without explicit version — reads packageManager field from root package.json (pnpm@9.15.0)"
  - "Analytics tests are scoped to auth enforcement + 2 happy paths per RESEARCH.md Pitfall 3 — not exhaustive SQL variant testing"

patterns-established:
  - "vi.mock redis shape must match what the router actually imports (e.g., infrastructure imports redis.get directly; analytics imports named functions)"

requirements-completed: []

# Metrics
duration: ~45min
completed: 2026-02-24
---

# Phase 26 Plan 03: Infrastructure/Users Tests and CI Summary

**60-test Vitest suite covering all 7 tRPC routers with module-level Prisma mocking, plus GitHub Actions CI on PRs to main**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-02-24T01:30:00Z
- **Completed:** 2026-02-24T02:21:43Z
- **Tasks:** 2
- **Files modified:** 6 created + 1 modified (infrastructure.test.ts test fix)

## Accomplishments
- Created infrastructure.test.ts (6 tests): adminProcedure FORBIDDEN enforcement, getMapStatus stale/fresh paths, costProjection happy path
- Created users.test.ts (7 tests): users.me auth + ADMIN + CUSTOMER scoping, updateTimezone, updateProfile
- Created .github/workflows/ci.yml: triggers pnpm turbo test on PRs to main branch
- Full suite passes: 60 tests across 7 router files in 2.49s

## Task Commits

Each task was committed atomically:

1. **Task 1: Analytics, windows, and tags router tests** - `592d724` (test)
2. **Task 2: Infrastructure/users tests + GitHub Actions CI** - `2b047ca` (feat)

## Files Created/Modified

- `packages/api/src/routers/analytics.test.ts` - 9 tests: auth enforcement, eventSummary BigInt happy path, live mode, CUSTOMER org-scoping for velocityHistory
- `packages/api/src/routers/windows.test.ts` - 10 tests: list, create (happy path + overlap BAD_REQUEST + invalid times), toggle, delete
- `packages/api/src/routers/tags.test.ts` - 4 tests: UNAUTHORIZED, ADMIN returns tags, CUSTOMER returns tags (global, no org-scoping), empty array
- `packages/api/src/routers/infrastructure.test.ts` - 6 tests: FORBIDDEN for unauthenticated + CUSTOMER (adminProcedure), getMapStatus stale + fresh, costProjection
- `packages/api/src/routers/users.test.ts` - 7 tests: users.me UNAUTHORIZED + ADMIN + CUSTOMER, updateTimezone, updateProfile
- `.github/workflows/ci.yml` - CI workflow using pnpm turbo test on PR to main

## Decisions Made

- adminProcedure uses a single `isAdmin` middleware that checks `!ctx.user || role !== 'ADMIN'` and throws FORBIDDEN in both cases. There is no separate UNAUTHORIZED guard. Test for unauthenticated callers on adminProcedure was corrected to expect FORBIDDEN.
- CI uses `pnpm/action-setup@v4` without an explicit version field — it reads from `packageManager: pnpm@9.15.0` in root package.json per action docs.
- Analytics tests are scoped per RESEARCH.md Pitfall 3: auth enforcement + 2 happy paths only, not exhaustive raw SQL variant tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed UNAUTHORIZED expectation on adminProcedure to FORBIDDEN**
- **Found during:** Task 2 (infrastructure tests)
- **Issue:** Plan noted "unauthenticated caller gets UNAUTHORIZED" but `adminProcedure` uses `isAdmin` middleware which throws FORBIDDEN for both unauthenticated and non-ADMIN callers — there is no separate auth check
- **Fix:** Updated `infrastructure.test.ts` test description and expected code from UNAUTHORIZED to FORBIDDEN
- **Files modified:** `packages/api/src/routers/infrastructure.test.ts`
- **Verification:** Test passes with corrected expectation; behavior matches actual `trpc.ts` source
- **Committed in:** `2b047ca` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix necessary for test correctness — the test was wrong, not the implementation. No scope creep.

## Issues Encountered

None beyond the auto-fixed FORBIDDEN/UNAUTHORIZED mismatch above.

## User Setup Required

None - no external service configuration required. CI workflow uses only mocked tests with no secrets.

## Next Phase Readiness

- Full Vitest test suite (60 tests, 7 routers) is complete and passing
- CI enforces test passing on every PR to main going forward
- Phase 26 testing suite is complete — ready for application feature development phases
- Any new tRPC router should follow the module-level vi.mock pattern established here

---
*Phase: 26-update-load-tests-and-add-core-functionality-testing-suite*
*Completed: 2026-02-24*

## Self-Check: PASSED

All claimed files exist and all commits are present in git history.
