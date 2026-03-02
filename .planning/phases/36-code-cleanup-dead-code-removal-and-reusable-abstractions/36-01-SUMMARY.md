---
phase: 36-code-cleanup-dead-code-removal-and-reusable-abstractions
plan: 01
subsystem: ui
tags: [shadcn, radix-ui, react, typescript, monorepo, packages]

# Dependency graph
requires: []
provides:
  - "packages/ui as single source of truth for all 20 shadcn primitives"
  - "Subpath exports for all 20 components via @sparkmotion/ui/* pattern"
  - "Consolidated cn utility export from @sparkmotion/ui"
affects: [all-future-ui-plans, admin-app, customer-app]

# Tech tracking
tech-stack:
  added:
    - "@radix-ui/react-checkbox ^1.3.3"
    - "@radix-ui/react-dialog ^1.1.15"
    - "@radix-ui/react-dropdown-menu ^2.1.16"
    - "@radix-ui/react-label ^2.1.8"
    - "@radix-ui/react-popover ^1.1.15"
    - "@radix-ui/react-select ^2.2.6"
    - "@radix-ui/react-slot ^1.2.4"
    - "@radix-ui/react-switch ^1.2.6"
    - "@radix-ui/react-tabs ^1.1.13"
    - "@radix-ui/react-tooltip ^1.2.8"
    - "class-variance-authority ^0.7.1 (to packages/ui)"
    - "cmdk ^1.1.1 (to packages/ui)"
    - "lucide-react ^0.563.0 (to packages/ui)"
    - "react-day-picker ^9.13.2 (to packages/ui)"
    - "react-hook-form ^7.71.1 (to packages/ui)"
    - "zod ^3.25.76 (to packages/ui)"
  patterns:
    - "Subpath exports pattern: @sparkmotion/ui/badge, @sparkmotion/ui/button, etc."
    - "Relative cn import in packages/ui components: ../../lib/utils"
    - "Cross-component imports in packages/ui use relative siblings: ./button, ./dialog, ./label"

key-files:
  created:
    - "packages/ui/src/components/ui/badge.tsx"
    - "packages/ui/src/components/ui/button.tsx"
    - "packages/ui/src/components/ui/calendar.tsx"
    - "packages/ui/src/components/ui/card.tsx"
    - "packages/ui/src/components/ui/checkbox.tsx"
    - "packages/ui/src/components/ui/command.tsx"
    - "packages/ui/src/components/ui/dialog.tsx"
    - "packages/ui/src/components/ui/dropdown-menu.tsx"
    - "packages/ui/src/components/ui/form.tsx"
    - "packages/ui/src/components/ui/input.tsx"
    - "packages/ui/src/components/ui/label.tsx"
    - "packages/ui/src/components/ui/popover.tsx"
    - "packages/ui/src/components/ui/select.tsx"
    - "packages/ui/src/components/ui/sheet.tsx"
    - "packages/ui/src/components/ui/skeleton.tsx"
    - "packages/ui/src/components/ui/switch.tsx"
    - "packages/ui/src/components/ui/table.tsx"
    - "packages/ui/src/components/ui/tabs.tsx"
    - "packages/ui/src/components/ui/tooltip.tsx"
  modified:
    - "packages/ui/package.json - added 10 Radix deps + cmdk + lucide-react + form/calendar deps + 20 subpath exports"
    - "packages/ui/src/index.ts - re-exports all 20 primitives + cn"
    - "packages/ui/src/components/ui/chart.tsx - replaced with customer superset version (380 lines)"
    - "apps/admin/src/**/*.tsx - ~239 import sites updated to @sparkmotion/ui/*"
    - "apps/customer/src/**/*.tsx - ~174 import sites updated to @sparkmotion/ui/*"

key-decisions:
  - "Used customer chart.tsx (380 lines) as canonical — superset API with labelFormatter/formatter props; backwards-compatible with admin usage"
  - "Deleted apps/*/src/lib/utils.ts — both only exported cn(), now served from @sparkmotion/ui"
  - "calendar.tsx and command.tsx use ./button and ./dialog relative imports within packages/ui (not @sparkmotion/ui/* to avoid circular subpath issues)"
  - "form.tsx uses ./label relative import within packages/ui"
  - "sed replacements ran for both double-quoted and single-quoted import variants — 3 files in each app used single quotes"

patterns-established:
  - "Import pattern: always import shadcn primitives from @sparkmotion/ui/component-name"
  - "Import cn from @sparkmotion/ui (not @/lib/utils)"
  - "Add new shadcn components to packages/ui, never to individual apps"

requirements-completed: []

# Metrics
duration: 27min
completed: 2026-03-02
---

# Phase 36 Plan 01: Consolidate shadcn Primitives into packages/ui Summary

**Migrated all 20 shadcn UI primitives from 40 duplicated app-local files into packages/ui as single source of truth, eliminating 4600+ lines of duplication across ~473 import sites**

## Performance

- **Duration:** 27 min
- **Started:** 2026-03-02T21:33:51Z
- **Completed:** 2026-03-02T22:00:36Z
- **Tasks:** 2
- **Files modified:** 211 (23 in Task 1, 188 in Task 2)

## Accomplishments

- All 20 shadcn primitives consolidated into `packages/ui/src/components/ui/` as single source of truth
- All ~413 import sites across admin (239) and customer (174) updated to `@sparkmotion/ui/*` subpath exports
- Deleted 40 duplicated files (20 per app) plus 2 redundant `lib/utils.ts` files
- Both admin and customer apps build and type-check successfully
- `chart.tsx` upgraded to customer superset version with `labelFormatter`/`formatter` props

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deps to packages/ui and copy shadcn primitives with cn path fix** - `0b20283` (feat)
2. **Task 2: Update all import sites in both apps and delete local copies** - `23813b9` (feat)

**Plan metadata:** `(pending docs commit)` (docs: complete plan)

## Files Created/Modified

- `packages/ui/package.json` - Added 10 Radix UI packages + cmdk + lucide-react + form/calendar deps + 20 subpath exports
- `packages/ui/src/index.ts` - Re-exports all 20 primitives + cn utility
- `packages/ui/src/components/ui/*.tsx` - 19 new files + 1 updated (chart.tsx superset version)
- `apps/admin/src/**/*.tsx` - ~239 import sites migrated + utils.ts deleted
- `apps/customer/src/**/*.tsx` - ~174 import sites migrated + utils.ts deleted

## Decisions Made

- Used customer `chart.tsx` (380 lines) as canonical version — it has a superset API with `labelFormatter`/`formatter` props that admin doesn't use but doesn't conflict with
- Deleted both `apps/*/src/lib/utils.ts` files since they only exported `cn()`, which is now available from `@sparkmotion/ui`
- `calendar.tsx`, `command.tsx`, and `form.tsx` use relative sibling imports (`./button`, `./dialog`, `./label`) inside `packages/ui` to avoid circular import issues with subpath exports
- sed replacements for both double-quoted and single-quoted variants — discovered 3 files per app used single-quoted imports not caught by first pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed single-quoted import variants missed by first sed pass**
- **Found during:** Task 2 (build verification)
- **Issue:** sed only targeted double-quoted imports; 3 files per app used single-quoted `@/components/ui/*` imports
- **Fix:** Ran additional sed pass targeting single-quoted variants for all 20 components in both apps
- **Files modified:** apps/admin/src/components/events/datetime-display.tsx, apps/admin/src/components/settings/timezone-selector.tsx (x2), apps/customer equivalents
- **Verification:** Zero remaining `@/components/ui/` imports; both apps compile
- **Committed in:** 23813b9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Required for correctness — build would have failed without the fix. No scope creep.

## Issues Encountered

- Customer app had a transient `PageNotFoundError` for `/api/auth/transfer-token` on first build attempt; succeeded on retry. This is a pre-existing issue documented in STATE.md blockers, not caused by this migration.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

All files verified present, both task commits verified in git log.

## Next Phase Readiness

- packages/ui is now the canonical location for all shadcn primitives
- Both apps build cleanly with zero local UI component copies
- Ready for Phase 36-02 (business component consolidation)

---
*Phase: 36-code-cleanup-dead-code-removal-and-reusable-abstractions*
*Completed: 2026-03-02*
