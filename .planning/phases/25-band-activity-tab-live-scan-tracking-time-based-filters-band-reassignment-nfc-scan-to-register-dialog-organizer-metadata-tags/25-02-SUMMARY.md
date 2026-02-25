---
phase: 25-band-activity-tab
plan: 02
subsystem: ui, admin, customer
tags: [react, trpc, tanstack-table, shadcn, date-fns, activity-feed, tabs]

# Dependency graph
requires:
  - phase: 25-01
    provides: bands.activityFeed, bands.listAll, tags.list tRPC procedures

provides:
  - ActivityFeed component (admin + customer) with 15s polling, time presets, org/event/tag filters, pagination
  - TagBadge component (admin + customer) for colored inline tag display
  - Tabbed /bands page in both apps (Activity + Bands tabs)
  - BandReviewTable updated with Tag column and tag filter in both apps
  - shadcn Tabs component installed in both apps

affects:
  - 25-03 (tag management UI can use TagBadge component pattern)

# Tech tracking
tech-stack:
  added:
    - "@radix-ui/react-tabs via shadcn Tabs component (both apps)"
  patterns:
    - "15s polling via tRPC refetchInterval: 15000 for live activity feed"
    - "Time preset buttons with disabled state (This window requires eventId selection)"
    - "windows.list query gated by enabled: !!eventId && timePreset === 'this-window' to avoid unnecessary fetches"
    - "events.list returns array directly (not { events: [] }) — important for component typing"
    - "Component duplication pattern (admin/customer) per established Phase 8 decision"

key-files:
  created:
    - apps/admin/src/components/bands/activity-feed.tsx
    - apps/admin/src/components/bands/tag-badge.tsx
    - apps/admin/src/components/ui/tabs.tsx
    - apps/customer/src/components/bands/activity-feed.tsx
    - apps/customer/src/components/bands/tag-badge.tsx
    - apps/customer/src/components/ui/tabs.tsx
  modified:
    - apps/admin/src/app/(dashboard)/bands/page.tsx
    - apps/admin/src/components/bands/band-review-table.tsx
    - apps/customer/src/app/(dashboard)/bands/page.tsx
    - apps/customer/src/components/bands/band-review-table.tsx

key-decisions:
  - "windows.list query uses enabled guard (requires eventId + this-window preset active) to prevent unnecessary fetches"
  - "events.list returns array directly — no wrapping object, unlike some other list procedures"
  - "TagBadge duplicated per-app following established codebase duplication pattern (KISS over DRY)"
  - "Customer ActivityFeed omits orgId param entirely — backend auto-scopes via CUSTOMER role check"

# Metrics
duration: 7min
completed: 2026-02-22
---

# Phase 25 Plan 02: Band Activity Tab UI Summary

**Tabbed /bands page in both admin and customer apps with live-polling activity feed (15s), time preset filters (last hour/today/this window/all/custom), org/event/tag filtering, tag badge component, and tag column added to BandReviewTable**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-02-22T17:40:21Z
- **Completed:** 2026-02-22T17:47:00Z
- **Tasks:** 2
- **Files modified:** 10 (4 created new, 6 modified)

## Accomplishments

- Installed shadcn Tabs component in both admin and customer apps via `pnpm dlx shadcn@latest add tabs`
- Created TagBadge component in both apps: renders colored pill badges using tag.color as inline background style
- Created ActivityFeed component (admin, 375 lines): time presets (last hour, today, this window, all time, custom date range), org/event/tag Select filters, TapLog table with Band ID/Event/Tag/Mode/Timestamp/Registrant columns, 15s polling, pagination
- Created ActivityFeed component (customer, 353 lines): same as admin but without org filter — backend auto-scopes via CUSTOMER role
- Updated admin bands page: tabbed layout (Activity + Bands) with page title changed to "Band Activity"
- Updated customer bands page: same tabbed layout, no orgs fetch needed (customer is org-scoped)
- Updated admin BandReviewTable: added Tag column (TagBadge), tag Select filter, tagId passed to listAll query
- Updated customer BandReviewTable: same tag column + filter additions, no org filter

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin app — tabs, tag badge, activity feed, page update, band-review-table tag column** - `f3a95a0` (feat)
2. **Task 2: Customer app — tabs, tag badge, activity feed, page update, band-review-table tag column** - `e334750` (feat)

## Files Created/Modified

- `apps/admin/src/components/ui/tabs.tsx` - shadcn Tabs primitive (installed)
- `apps/admin/src/components/bands/tag-badge.tsx` - Colored tag pill component
- `apps/admin/src/components/bands/activity-feed.tsx` - Activity feed with all filters and polling
- `apps/admin/src/app/(dashboard)/bands/page.tsx` - Repurposed to tabbed layout (Activity + Bands)
- `apps/admin/src/components/bands/band-review-table.tsx` - Added Tag column and tag filter
- `apps/customer/src/components/ui/tabs.tsx` - shadcn Tabs primitive (installed)
- `apps/customer/src/components/bands/tag-badge.tsx` - Colored tag pill component (duplicated)
- `apps/customer/src/components/bands/activity-feed.tsx` - Activity feed without org filter
- `apps/customer/src/app/(dashboard)/bands/page.tsx` - Repurposed to tabbed layout
- `apps/customer/src/components/bands/band-review-table.tsx` - Added Tag column and tag filter

## Decisions Made

- **windows.list gated by enabled guard** — The query only fires when `eventId` is selected AND `timePreset === 'this-window'`, preventing unnecessary window fetches when the preset is not active.
- **events.list returns array directly** — Unlike some other list procedures, `events.list` returns `Event[]` not `{ events: Event[] }`, which required correct typing in the activity feed (no `.events` accessor).
- **Customer omits orgId entirely** — The `activityFeed` backend auto-scopes to the customer's org via `ctx.user.orgId` when role is CUSTOMER, so the customer feed doesn't pass `orgId` at all.
- **Component duplication (admin/customer)** — TagBadge and ActivityFeed are duplicated per-app following the established Phase 8 codebase pattern (KISS over DRY, allows app-specific customization).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in both apps (unrelated to this plan):
- `apps/admin/src/components/ui/checkbox.tsx`: Cannot find module `@radix-ui/react-checkbox`
- `apps/customer/src/components/settings/active-event-priority-toggle.tsx`: `updateActiveEventPriority` does not exist on organizations router

Neither error was caused by or related to this plan's changes. Both are out-of-scope per deviation rules.

## User Setup Required

None.

## Next Phase Readiness

- Phase 25-03 (tag management admin UI) can proceed: TagBadge pattern established, tags CRUD backend ready
- Activity feed is live and functional: 15s polling, all time filters, org/event/tag filters operational

---
*Phase: 25-band-activity-tab*
*Completed: 2026-02-22*

## Self-Check: PASSED

All 7 key files found on disk. Both task commits (f3a95a0, e334750) verified in git log.
