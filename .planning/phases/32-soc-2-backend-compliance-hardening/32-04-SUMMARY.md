---
phase: 32-soc-2-backend-compliance-hardening
plan: 04
subsystem: infra
tags: [ci, github-actions, dependabot, codeql, security, soc2, pnpm-audit]

# Dependency graph
requires: []
provides:
  - pnpm audit CI job blocking build on high/critical vulnerabilities
  - Dependabot weekly PRs for npm and github-actions dependencies
  - CodeQL static analysis on push/PR/weekly schedule
  - GitHub secret scanning (manual enablement required)
affects: [ci, security, soc2]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Security gate pattern: audit job gates build job in CI pipeline"
    - "Defense-in-depth: audit (runtime deps) + CodeQL (static analysis) + Dependabot (proactive updates) + secret scanning (credential leaks)"

key-files:
  created:
    - .github/dependabot.yml
    - .github/workflows/codeql.yml
  modified:
    - .github/workflows/ci.yml

key-decisions:
  - "--audit-level=high ignores moderate/low (frequent false positives) while catching exploitable vulnerabilities"
  - "Dependabot ignores major version bumps for Next.js, tRPC, and Prisma — major upgrades require manual review due to breaking changes"
  - "Dependabot covers both npm and github-actions ecosystems — action pinning vulnerabilities are a real attack vector"
  - "CodeQL weekly cron on Monday 6 AM UTC matches Dependabot weekly cadence for consistent security review day"
  - "build job needs [lint, test, audit] — audit must pass before producing build artifacts"

patterns-established:
  - "Security gate pattern: CI audit job runs in parallel with lint/test, gates build"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-02-28
---

# Phase 32 Plan 04: CI Security Gates Summary

**pnpm audit in CI, Dependabot weekly dependency PRs, and CodeQL TypeScript static analysis added as SOC 2 automated vulnerability detection gates**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-28T07:38:37Z
- **Completed:** 2026-02-28T07:46:00Z
- **Tasks:** 2 of 2
- **Files modified:** 3

## Accomplishments
- Added `audit` job to CI that runs `pnpm audit --audit-level=high`, parallel to lint and test
- Updated `build` job to depend on `[lint, test, audit]` — build artifacts only produced when all security checks pass
- Created `.github/dependabot.yml` with weekly npm + github-actions update PRs; major version bumps for Next.js, tRPC, and Prisma ignored (require manual review)
- Created `.github/workflows/codeql.yml` with javascript-typescript analysis on push/PR to main/staging and weekly Monday 6 AM UTC cron

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pnpm audit to CI + create Dependabot and CodeQL configs** - `f597228` (feat)
2. **Task 2: Enable GitHub secret scanning** - confirmed by user (human-action, no commit — repo setting)

## Files Created/Modified
- `.github/workflows/ci.yml` - Added audit job and updated build needs to [lint, test, audit]
- `.github/dependabot.yml` - Weekly npm + github-actions dependency update PRs with major version ignores
- `.github/workflows/codeql.yml` - CodeQL javascript-typescript analysis on push/PR/weekly schedule

## Decisions Made
- `--audit-level=high`: Only fail on high/critical vulnerabilities. Moderate/low are frequently false positives in monorepos and would create constant noise without security benefit.
- Dependabot ignores major version bumps for Next.js, tRPC, Prisma — these require coordinated manual upgrades; minor/patch security fixes are auto-PR'd.
- Both npm and github-actions ecosystems covered — compromised GitHub Actions are a known supply-chain attack vector.
- CodeQL cron matches Dependabot Monday cadence — consistent weekly security review day.

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Completed

**GitHub secret scanning enabled** — user confirmed both secret scanning and push protection are active on the repository. This completes the SOC 2 requirement for credential leak detection at the source control layer.

## Next Phase Readiness
- CI security gates active on next PR/push to main or staging
- Dependabot will open first PRs on the following Monday
- CodeQL will run on next push to main/staging
- Secret scanning + push protection active — blocks commits containing secrets before they reach the remote

---
*Phase: 32-soc-2-backend-compliance-hardening*
*Completed: 2026-02-28*
