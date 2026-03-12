---
phase: "39"
plan: "01"
subsystem: "ui-shared"
tags: ["refactor", "events", "packages/ui", "deduplication"]
dependency_graph:
  requires: []
  provides: ["@sparkmotion/ui/events"]
  affects: ["apps/admin", "apps/customer"]
tech_stack:
  added: []
  patterns: ["optional-props-unification", "relative-imports-in-packages-ui", "barrel-export"]
key_files:
  created:
    - packages/ui/src/components/events/event-form.tsx
    - packages/ui/src/components/events/event-edit-form.tsx
    - packages/ui/src/components/events/event-form-dialog.tsx
    - packages/ui/src/components/events/event-trash-button.tsx
    - packages/ui/src/components/events/event-mode-header.tsx
    - packages/ui/src/components/events/event-settings.tsx
    - packages/ui/src/components/events/event-card-list.tsx
    - packages/ui/src/components/events/event-list-with-actions.tsx
    - packages/ui/src/components/events/event-page-actions.tsx
    - packages/ui/src/components/events/event-detail-tabs.tsx
    - packages/ui/src/components/events/delete-events-dialog.tsx
    - packages/ui/src/components/events/events-analytics.tsx
    - packages/ui/src/components/events/windows-list.tsx
    - packages/ui/src/components/events/window-form.tsx
    - packages/ui/src/components/events/index.ts
  modified:
    - packages/ui/package.json
    - packages/ui/src/components/campaigns/campaign-form-dialog.tsx
    - apps/admin/src/app/(dashboard)/events/page.tsx
    - apps/admin/src/app/(dashboard)/events/[id]/page.tsx
    - apps/admin/src/app/(dashboard)/events/[id]/windows/page.tsx
    - apps/admin/src/app/(dashboard)/organizations/[id]/page.tsx
    - apps/admin/src/components/campaigns/campaign-events-tab.tsx
    - apps/customer/src/app/(dashboard)/events/page.tsx
    - apps/customer/src/app/(dashboard)/events/[id]/page.tsx
    - apps/customer/src/app/(dashboard)/events/[id]/windows/page.tsx
    - apps/customer/src/components/campaigns/campaign-events-tab.tsx
decisions:
  - "Used optional props pattern (orgs?, showSampleUrl?, extraSettingsSections?, renderBandsTab?) to unify admin/customer variants without branching"
  - "EventDetailTabs uses renderBandsTab render prop since band components are app-local and not yet in packages/ui"
  - "ExportAnalyticsButton import kept as @/components/analytics/export-analytics-button (app-local @/ alias resolves at build time)"
  - "ModeIndicator and DateTimeDisplay imported via relative paths, not from parent index, after ..'  import failed"
metrics:
  duration: "approx 36 minutes"
  completed: "2026-03-11"
  tasks_completed: 2
  files_changed: 57
---

# Phase 39 Plan 01: Extract Event Domain Components to packages/ui Summary

Extracted all 14 event-domain components duplicated across apps/admin and apps/customer into a single canonical implementation at `packages/ui/src/components/events/`, eliminating ~8000 lines of duplicated code.

## What Was Built

15 unified components now live at `@sparkmotion/ui/events`:

- `EventForm` — org selector rendered only when `orgs?` prop provided (admin); hidden for customer
- `EventEditForm` — unified tRPC mutation, merged admin/customer event interface
- `EventFormDialog` — `orgs?` for admin, `orgId?` for customer
- `EventTrashButton` — `showDeletedBy?` prop (true for admin, false default)
- `EventModeHeader` — `showOrgName?` prop (true for admin)
- `EventSettings` — `extraSections?: React.ReactNode` slot for admin cleanup analytics
- `EventCardList` — superset interface (city/state + formattedAddress/location)
- `EventListWithActions` — `orgName?` optional; derives from selected events if omitted
- `EventPageActions` — `orgs?` for admin, `orgId?` for customer
- `EventDetailTabs` — `renderBandsTab?` render prop, `showSampleUrl?`, `extraSettingsSections?`
- `DeleteEventsDialog` — `multiOrg?` flag for admin cross-org prevention
- `EventsAnalytics` — canonical admin version (1241 lines), ExportAnalyticsButton via app-local `@/`
- `WindowsList` — identical across apps, updated to relative imports
- `WindowFormDialog` — identical across apps, updated to relative imports
- `CampaignFilter` — already in packages/ui, kept as-is

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `import from ".."` failed in windows-list.tsx**
- **Found during:** Task 2 (build)
- **Issue:** `windows-list.tsx` imported `ModeIndicator, DateTimeDisplay` from `".."` which resolved to `packages/ui/src/components/` directory (no index.ts), not `packages/ui/src/`
- **Fix:** Changed to direct relative imports `../mode-indicator` and `../datetime-display`
- **Files modified:** `packages/ui/src/components/events/windows-list.tsx`
- **Commit:** 9b8ece4

**2. [Rule 3 - Blocking] packages/ui campaign-form-dialog still used app-local import**
- **Found during:** Task 2 (build)
- **Issue:** `packages/ui/src/components/campaigns/campaign-form-dialog.tsx` imported `EventForm` from `@/components/events/event-form` (stale from Phase 39-02 migration)
- **Fix:** Changed to `../events/event-form` (relative within packages/ui)
- **Files modified:** `packages/ui/src/components/campaigns/campaign-form-dialog.tsx`
- **Commit:** 9b8ece4

### Pre-existing Build Failure (Out of Scope)

The customer app build fails with `Cannot find module 'papaparse' or its corresponding type declarations` — confirmed pre-existing before this branch. The admin build passes cleanly. Logged to deferred items.

## Self-Check: PASSED

- All 15 event component files exist in `packages/ui/src/components/events/`
- Commits cdb0945 and 9b8ece4 exist
- Zero remaining `@/components/events/` imports in either app
- Admin build compiles successfully
