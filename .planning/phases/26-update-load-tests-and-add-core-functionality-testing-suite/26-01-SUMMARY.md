---
phase: 26-update-load-tests-and-add-core-functionality-testing-suite
plan: 01
subsystem: testing
tags: [k6, vitest, trpc, prisma, vitest-mock-extended, load-testing]

# Dependency graph
requires: []
provides:
  - Consolidated k6 load test with local (5K RPS) and cloud (100 RPS) scenarios via SCENARIO env var
  - Vitest 4.x test infrastructure in packages/api with globals enabled
  - Shared test-utils.ts with createTestCaller, prismaMock, and 6 factory functions
  - turbo.json test task for Turborepo-cached test runs
affects:
  - packages/api router test plans (bands, events, campaigns, analytics, windows, tags, infrastructure)

# Tech tracking
tech-stack:
  added:
    - vitest@^4.0.18 (packages/api devDependency)
    - vitest-mock-extended@^3.1.0 (packages/api devDependency)
  patterns:
    - k6 ramping-arrival-rate executor for guaranteed RPS throughput targeting
    - SCENARIO env var for k6 local vs cloud scenario selection
    - createCallerFactory pattern for direct tRPC router testing without HTTP server
    - vi.mock('@sparkmotion/database') required per test file because routers import db at module scope
    - mockDeep<PrismaClient>() auto-generates vitest mock for all Prisma model methods

key-files:
  created:
    - load-tests/redirect-load.js (consolidated — replaces both old local+cloud scripts)
    - packages/api/vitest.config.ts
    - packages/api/src/test-utils.ts
  modified:
    - packages/api/package.json (added test script, vitest devDeps)
    - packages/api/tsconfig.json (added vitest/globals and node types)
    - turbo.json (added test task)
  deleted:
    - load-tests/redirect-load-cloud.js (merged into redirect-load.js)

key-decisions:
  - "ramping-arrival-rate executor used for local k6 scenario — guarantees 5K RPS vs ramping-vus which is implicit"
  - "SCENARIO env var selects local (ramping-arrival-rate) vs cloud (constant-arrival-rate) test profile"
  - "vitest run --passWithNoTests used in test script so pnpm test passes before any test files exist"
  - "Factory functions match actual Prisma schema fields — plan spec had incorrect field names (BandTag has title not name/color, EventWindow has no name, Campaign has no slug/description)"
  - "prismaMock exported from test-utils.ts but each test file must also call vi.mock('@sparkmotion/database') because routers import db directly at module scope"

patterns-established:
  - "Pattern 1: k6 multi-scenario — define scenarios object keyed by name, export options.scenarios = scenarios[SCENARIO]"
  - "Pattern 2: tRPC test caller — createCallerFactory(appRouter) called in createTestCaller helper, ctx passed directly (bypasses createTRPCContext and auth())"
  - "Pattern 3: Prisma mocking — vi.mock('@sparkmotion/database', () => ({ db: prismaMock, Prisma: { sql: vi.fn(...), join: vi.fn(...) } })) at top of each test file"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 26 Plan 01: Load Test Consolidation and Vitest Bootstrap Summary

**Consolidated k6 script with ramping-arrival-rate for guaranteed 5K RPS; Vitest 4.x bootstrapped in packages/api with createTestCaller factory and 6 Prisma-typed mock factories**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T00:41:21Z
- **Completed:** 2026-02-24T00:44:14Z
- **Tasks:** 2
- **Files modified:** 7 (1 deleted, 3 created, 3 modified)

## Accomplishments
- Replaced ramping-vus with ramping-arrival-rate executor to guarantee 5K RPS target for local load tests
- Merged redirect-load-cloud.js into redirect-load.js with SCENARIO env var switching (local/cloud)
- Added handleSummary export to cloud scenario (was missing from original redirect-load-cloud.js)
- Installed vitest@^4.0.18 + vitest-mock-extended@^3.1.0 in packages/api
- Created vitest.config.ts with globals:true, node environment, src/**/*.test.ts include glob
- Created test-utils.ts with prismaMock, createTestCaller, buildUser, and 6 factory functions typed to actual Prisma schema
- Added test task to turbo.json pipeline for Turborepo caching

## Task Commits

Each task was committed atomically:

1. **Task 1: Consolidate k6 load test scripts** - `31530c6` (chore)
2. **Task 2: Bootstrap Vitest infrastructure** - `b77cae0` (feat)

## Files Created/Modified
- `load-tests/redirect-load.js` - Consolidated k6 script; local scenario uses ramping-arrival-rate (5K RPS), cloud uses constant-arrival-rate (100 RPS); SCENARIO env var selects profile
- `load-tests/redirect-load-cloud.js` - DELETED; functionality merged into redirect-load.js
- `packages/api/vitest.config.ts` - Vitest config with globals:true, node environment, src/**/*.test.ts include
- `packages/api/src/test-utils.ts` - prismaMock (mockDeep<PrismaClient>), createTestCaller (createCallerFactory pattern), buildUser, and factory functions for org/event/band/campaign/window/tag
- `packages/api/package.json` - Added test script (vitest run --passWithNoTests) and vitest devDeps
- `packages/api/tsconfig.json` - Added types: [vitest/globals, node] to compilerOptions
- `turbo.json` - Added test task with dependsOn:^build and outputs:coverage/**

## Decisions Made
- Used `vitest run --passWithNoTests` so `pnpm test` passes before any test files exist (Vitest 4.x exits code 1 with no tests by default)
- Factory functions corrected to match actual Prisma schema — the plan spec had incorrect field names (BandTag uses `title` not `name`, has no `color` or `orgId`; EventWindow has no `name`; Campaign has no `slug` or `description`)
- `prismaMock` exported from test-utils.ts as a convenience but each test file must use `vi.mock('@sparkmotion/database')` because routers import `db` at module scope, not from context

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added --passWithNoTests to vitest run command**
- **Found during:** Task 2 (Bootstrap Vitest infrastructure)
- **Issue:** Vitest 4.x exits with code 1 when no test files are found. Plan said "should pass with 0 tests found, no errors" but bare `vitest run` fails without test files.
- **Fix:** Changed test script to `vitest run --passWithNoTests`
- **Files modified:** packages/api/package.json
- **Verification:** `pnpm --filter @sparkmotion/api test` exits code 0 with "No test files found, exiting with code 0"
- **Committed in:** b77cae0

**2. [Rule 1 - Bug] Corrected factory function fields to match actual Prisma schema**
- **Found during:** Task 2 (creating test-utils.ts)
- **Issue:** Plan spec listed incorrect fields — `createMockTag` was spec'd with `name`, `color`, `orgId` but `BandTag` model has only `id`, `title`, `createdAt`; `createMockWindow` was spec'd with `name` but `EventWindow` has no name field; `createMockCampaign` was spec'd with `slug`, `description` but Campaign model has neither
- **Fix:** Implemented all factories with fields matching the actual prisma/schema.prisma exactly
- **Files modified:** packages/api/src/test-utils.ts
- **Verification:** Factory return shapes match Prisma schema; no TypeScript errors expected in downstream test files
- **Committed in:** b77cae0

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None — both tasks executed smoothly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- k6 load test infrastructure ready: `k6 run -e WORKER_URL=... load-tests/redirect-load.js` (local) or add `-e SCENARIO=cloud` for cloud run
- Vitest infrastructure ready for Plan 02+ router test files to be added as `src/routers/*.test.ts`
- Each new test file needs `vi.mock('@sparkmotion/database', ...)` and optionally `vi.mock('@sparkmotion/redis', ...)` at module level
- `turbo test` command now available for CI pipeline integration

---
*Phase: 26-update-load-tests-and-add-core-functionality-testing-suite*
*Completed: 2026-02-24*
