---
phase: 36-code-cleanup-dead-code-removal-and-reusable-abstractions
plan: 02
subsystem: ui/packages
tags: [refactor, deduplication, shared-components, cleanup]
dependency_graph:
  requires: [36-01]
  provides: [shared-business-components, trash-sheet-abstraction]
  affects: [admin, customer, packages/ui]
tech_stack:
  added: [use-places-autocomplete]
  patterns: [shared-ui-package, generic-components, optional-prop-unification]
key_files:
  created:
    - packages/ui/src/components/mode-indicator.tsx
    - packages/ui/src/components/stat-card.tsx
    - packages/ui/src/components/datetime-display.tsx
    - packages/ui/src/components/tag-badge.tsx
    - packages/ui/src/components/google-places-autocomplete.tsx
    - packages/ui/src/components/connection-status.tsx
    - packages/ui/src/components/live-kpi-cards.tsx
    - packages/ui/src/components/trash-sheet.tsx
    - packages/ui/src/hooks/use-debounce.ts
    - packages/ui/src/utils/us-timezones.ts
  modified:
    - packages/ui/src/index.ts
    - packages/ui/package.json
    - apps/admin/src/components/events/event-mode-header.tsx
    - apps/customer/src/components/events/event-mode-header.tsx
    - apps/admin/src/components/events/event-trash-button.tsx
    - apps/admin/src/components/campaigns/campaign-trash-button.tsx
    - apps/admin/src/components/bands/band-trash-button.tsx
    - apps/admin/src/components/organizations/org-trash-button.tsx
    - apps/customer/src/components/events/event-trash-button.tsx
    - apps/customer/src/components/campaigns/campaign-trash-button.tsx
    - apps/customer/src/components/bands/band-trash-button.tsx
decisions:
  - kpi-cards and velocity-sparkline kept in apps (trpc coupling prevents moving to packages/ui)
  - event-mode-header kept in apps (trpc coupling) but unified with showOrgName optional prop
  - connection-status and live-kpi-cards moved to packages/ui (no trpc dependency)
  - velocity-sparkline threshold bug fixed in customer app: 5x check before 2x (admin was correct)
  - TrashSheet uses controlled open/onOpenChange props so each trash button manages its own state
  - OrgTrashButton omits undo action per Phase 34 decision (cascade restore cannot be undone simply)
metrics:
  duration: ~45 minutes
  completed: 2026-03-02
  tasks_completed: 2
  tasks_total: 2
  files_created: 10
  files_modified: 11
  files_deleted: 18
---

# Phase 36 Plan 02: Shared Business Components and TrashSheet Abstraction Summary

Moved 8 trpc-free business components, 1 hook, and 1 utility to packages/ui. Created a generic TrashSheet component that reduces 7 entity-specific trash buttons from ~175 lines each to 65-85 lines each. Fixed a velocity-sparkline threshold ordering bug in the customer app where yellow absorbed red.

## Tasks Completed

### Task 1: Move identical business components, hooks, and utils to packages/ui

Moved the following trpc-free components from both apps to packages/ui:
- `ModeIndicator` — mode badge for pre/live/post event states
- `StatCard` — dashboard stat card with icon, color, trend
- `DateTimeDisplay` — timezone-aware date display with tooltip
- `TagBadge` — colored badge for band tags
- `GooglePlacesAutocomplete` — venue search with Places API
- `ConnectionStatus` — SSE connection state indicator
- `LiveKpiCards` — real-time KPI cards (data passed as props, no trpc)
- `useDebounce` hook — debounce utility
- `US_TIMEZONES` and `getTimezoneForLocation` — timezone data and lookup

Components kept in apps due to trpc coupling: `KpiCards`, `VelocitySparkline`, `EventModeHeader`.

`EventModeHeader` was unified with a `showOrgName?: boolean` prop (admin defaults `true`, customer defaults `false`), replacing the only divergence between the two versions.

Velocity-sparkline threshold bug fixed in customer app: the customer version checked `avg * 2` (yellow) before `avg * 5` (red), meaning the red case was never reached. Fixed to match admin's correct cascade: 5x first, then 2x.

18 local duplicate files deleted across both apps.

### Task 2: Create TrashSheet generic component and refactor all 7 trash buttons

Created `packages/ui/src/components/trash-sheet.tsx` — a presentational component accepting all data and callbacks via props. No trpc coupling. Features:
- Trigger button with Trash2 icon and count Badge
- Sheet with entity-specific label ("Deleted Events", "Deleted Bands", etc.)
- Loading skeleton, empty state, item list with restore buttons
- `showDeletedBy` prop: admin passes `true`, customer passes `false`
- Days-remaining countdown with destructive color at 7 days or less
- Restore All button with loading spinner

Each trash button refactored to just tRPC hooks wiring + TrashSheet render:
- Admin event/campaign/band/org trash buttons: ~65-85 lines (down from ~175)
- Customer event/campaign/band trash buttons: ~65-83 lines (down from ~172)

Special cases preserved:
- BandTrashButton: skipped count handled in `onSuccess` callback with warning toast
- OrgTrashButton: no undo action on restore per Phase 34 decision (cascade restore)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed velocity-sparkline threshold cascade in customer app**
- **Found during:** Task 1
- **Issue:** Customer version checked `avg * 2` (yellow) before `avg * 5` (red), so `latest > avg * 5` was never reached (yellow absorbed it)
- **Fix:** Swapped the condition order to match admin's correct implementation
- **Files modified:** `apps/customer/src/components/analytics/velocity-sparkline.tsx`
- **Commit:** 8a59a31

**2. [Rule 1 - Decision] kpi-cards and live-kpi-cards trpc assessment revised**
- **Found during:** Task 1 analysis
- **Issue:** Plan listed live-kpi-cards as trpc-coupled, but the actual file only receives data as props (no trpc imports). connection-status also has no trpc.
- **Fix:** Moved both to packages/ui as planned (were already safe to move). kpi-cards correctly kept in apps (confirmed trpc.analytics.kpis.useQuery usage).
- **Commit:** 8a59a31

## Self-Check: PASSED

All created files verified to exist. Both commits (8a59a31 and 9391cf1) verified in git log.

### Verified files exist:
- packages/ui/src/components/mode-indicator.tsx - FOUND
- packages/ui/src/components/stat-card.tsx - FOUND
- packages/ui/src/components/trash-sheet.tsx - FOUND
- packages/ui/src/hooks/use-debounce.ts - FOUND
- packages/ui/src/utils/us-timezones.ts - FOUND

### Verified commits exist:
- 8a59a31 (Task 1) - FOUND
- 9391cf1 (Task 2) - FOUND
