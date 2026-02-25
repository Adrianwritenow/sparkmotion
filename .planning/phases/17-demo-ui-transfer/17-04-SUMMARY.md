---
phase: 17-demo-ui-transfer
plan: 04
subsystem: events-ui
tags: [ui, events, tabs, demo-transfer]
dependency-graph:
  requires: ["17-02"]
  provides: ["card-based-event-list", "tabbed-event-detail"]
  affects: [events-management]
tech-stack:
  added: []
  patterns: [card-layout, tab-navigation, query-params-state]
key-files:
  created:
    - apps/admin/src/components/events/event-card-list.tsx
    - apps/admin/src/components/events/event-detail-tabs.tsx
    - apps/customer/src/components/events/event-card-list.tsx
    - apps/customer/src/components/events/event-detail-tabs.tsx
    - apps/customer/src/components/events/event-edit-form.tsx
  modified:
    - apps/admin/src/app/(dashboard)/events/page.tsx
    - apps/admin/src/app/(dashboard)/events/[id]/page.tsx
    - apps/customer/src/app/(dashboard)/events/page.tsx
    - apps/customer/src/app/(dashboard)/events/[id]/page.tsx
decisions: []
metrics:
  duration: 196
  completed: 2026-02-10T16:35:45Z
---

# Phase 17 Plan 04: Events List and Detail UI Redesign Summary

Card-based event list with status badges and tabbed event detail pages integrating existing windows/analytics functionality.

## What Was Built

### Event Card List (Task 1)
**Component:** `EventCardList` (admin + customer)
- **Card design** matching demo: status badge, slug badge, analytics metrics (bands count, taps)
- **Status badges** with proper color scheme: green (ACTIVE), blue (DRAFT/upcoming), gray (COMPLETED), red (CANCELLED)
- **Metadata display**: date, organization (admin only)
- **Navigation**: "View Analytics" link, "View Event Details" button
- **Server-side data**: fetches from DB with proper includes (organization, _count.bands)

**Page Header:**
- Admin: "New Event" + "Create Campaign" buttons
- Customer: "New Event" button only (campaigns deferred)

**Differences:**
- Admin: `showOrg={true}`, shows all events
- Customer: `showOrg={false}`, org-scoped query

### Tabbed Event Detail (Task 2)
**Component:** `EventDetailTabs` (admin + customer)
- **4 tabs**: overview, url-manager, analytics, settings
- **State management**: URL query params (`?tab=overview`) — bookmarkable
- **Tab content**:
  - Overview: `EventEditForm` component (existing edit logic)
  - URL Manager: `WindowsList` component (existing windows functionality)
  - Analytics: `EventsAnalytics` component (existing analytics)
  - Settings: Placeholder

**Event Header:**
- Back to Events button
- Event name + slug badge + status badge
- Metadata row: Organization (admin), tour name, created date

**Integration:** Existing sub-pages (`/events/[id]/windows`, `/events/[id]/bands`) still work — tab is enhancement, not replacement.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash    | Message                                                      | Files Changed |
| ------- | ------------------------------------------------------------ | ------------- |
| a6c410d | feat(17-04): redesign events list with card-based layout     | 8             |
| 22630be | feat(17-04): add tabbed navigation to event detail pages     | 5             |

## Testing Notes

**Manual verification needed:**
1. Admin events list shows card layout with org names
2. Customer events list shows cards without org column
3. Status badges use correct colors
4. Event detail tabs switch via URL query params
5. Existing windows/bands functionality accessible via tabs
6. "New Event" button still links to `/events/new`
7. No regression in event creation flow

## Tech Decisions

**Pattern: Card-based list**
- Replaced old TanStack table with demo's card layout
- More visual hierarchy, better mobile responsiveness
- Shows analytics metrics inline (bands, taps)

**Pattern: Tab navigation via query params**
- Client component reads `searchParams.tab` from server component
- `router.push()` with `scroll: false` for smooth transitions
- URL state = bookmarkable, shareable

**Pattern: Component duplication (admin/customer)**
- Per established project convention
- EventCardList, EventDetailTabs, EventEditForm duplicated
- Allows app-specific customization without tight coupling

## Next Steps

Plan 17-05 will handle campaigns UI and organization detail pages. Events foundation is now complete.

## Self-Check: PASSED

### Created Files Verification
```
✓ apps/admin/src/components/events/event-card-list.tsx
✓ apps/admin/src/components/events/event-detail-tabs.tsx
✓ apps/customer/src/components/events/event-card-list.tsx
✓ apps/customer/src/components/events/event-detail-tabs.tsx
✓ apps/customer/src/components/events/event-edit-form.tsx
```

### Commits Verification
```
✓ a6c410d: feat(17-04): redesign events list with card-based layout
✓ 22630be: feat(17-04): add tabbed navigation to event detail pages
```

All files created. All commits exist. Tasks completed successfully.
