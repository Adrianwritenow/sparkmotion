---
phase: 38-update-auto-lifecycle-to-use-next-event-start-time-instead-of-event-start-end-dates
plan: "02"
subsystem: admin-ui
tags: [auto-lifecycle, event-settings, event-cards, campaign-ui, ui]
dependency_graph:
  requires: ["38-01"]
  provides: ["auto-lifecycle-admin-ui"]
  affects: ["admin-event-settings", "admin-event-cards", "campaign-events-tab", "customer-event-settings"]
tech_stack:
  added: []
  patterns:
    - "campaignId guard for campaign-only Settings sections"
    - "hasWindowsWithTimes derived prop via windows array .some() check"
    - "TooltipProvider wrapping entire list (single provider pattern)"
    - "Dismissible info banner with per-session useState"
    - "Server-side changeLog.findFirst for recent transition query"
key_files:
  created: []
  modified:
    - "apps/admin/src/components/events/event-edit-form.tsx"
    - "apps/admin/src/components/events/event-settings.tsx"
    - "apps/admin/src/components/events/event-detail-tabs.tsx"
    - "apps/admin/src/app/(dashboard)/events/[id]/page.tsx"
    - "apps/admin/src/components/events/event-card-list.tsx"
    - "apps/admin/src/components/campaigns/campaign-events-tab.tsx"
    - "apps/customer/src/components/events/event-edit-form.tsx"
    - "apps/customer/src/components/events/event-settings.tsx"
    - "apps/customer/src/components/events/event-detail-tabs.tsx"
    - "apps/customer/src/app/(dashboard)/events/[id]/page.tsx"
decisions:
  - "Applied same auto-lifecycle Settings UI to customer app (mirror of admin) since both apps shared the same stale toggle in event-edit-form"
  - "hasWindowsWithTimes computed inline via (event as any).windows?.some() in EventDetailTabs rather than adding to Prisma query — avoids schema change"
  - "TooltipProvider wraps entire EventCardList div (not per-card) per KISS — single provider handles all tooltip instances"
  - "campaignId guard in EventSettings outer wrapping means non-campaign events never see the auto-lifecycle section at all"
metrics:
  duration: "5 minutes"
  completed: "2026-03-09"
  tasks_completed: 3
  files_modified: 10
---

# Phase 38 Plan 02: Admin UI for Auto-Lifecycle Redesign Summary

Admin and customer app UI updated to reflect window-based campaign chain auto-lifecycle: toggle moved from edit form to Settings tab with requirements checklist, Clock icon added to event cards, campaign bulk toggle description updated, and dismissible transition banner added to Overview tab.

## What Was Built

### Task 1: Remove autoLifecycle from edit form, add to Settings with requirements checklist
- Removed `autoLifecycle` from `eventSchema`, `defaultValues`, `onSubmit`, and UI block in both admin and customer `event-edit-form.tsx`
- Added auto-lifecycle toggle section as the FIRST element in `EventSettings` (before Assign on Flag)
- Toggle only renders when `event.campaignId` is set (hidden for non-campaign events entirely)
- Requirements checklist shows when `startDate`, `endDate`, or `hasWindowsWithTimes` are missing
- Switch disabled when requirements not met (`!qualifies || updateEvent.isPending`)

### Task 2: Transition banner in Overview, new props through page and tabs
- `db.changeLog.findFirst` query added to admin and customer event detail `page.tsx` — finds `event.autoLifecycle.*` actions within last 24 hours
- `recentTransition` prop passed to `EventDetailTabs`
- Dismissible blue info banner rendered in Overview tab when transition exists and not yet dismissed (`transitionDismissed` useState)
- `EventSettings` receives expanded event object: `autoLifecycle`, `campaignId`, `startDate`, `endDate`, `hasWindowsWithTimes`
- `windows` added to `EventDetailTabsProps` event type; `hasWindowsWithTimes` computed inline via `.some()`

### Task 3: Clock icon on event cards, campaign bulk toggle update
- `Clock` from lucide-react added to `EventCardList` imports
- `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` imported from `@sparkmotion/ui/tooltip`
- `autoLifecycle?: boolean` added to `EventCardListProps` events array type
- `TooltipProvider` wraps entire `EventCardList` return (single provider)
- Clock icon with tooltip renders in middle row when `event.autoLifecycle` is true; tooltip shows "Auto-lifecycle enabled" and activation time from `windows[0].startTime`
- Campaign bulk toggle description updated from date-based to: "Automatically activate each event when its first window starts, and complete when the next event in the tour begins"
- `toast` from sonner imported in `campaign-events-tab.tsx`
- `toggleAutoLifecycle` mutation `onSuccess` updated to handle `{ updated, skipped }` return shape with `toast.warning` listing skipped events

## Deviations from Plan

### Auto-applied: Customer app mirrored

**1. [Rule 2 - Missing Critical Functionality] Applied same changes to customer app**
- **Found during:** Task 1 and Task 2
- **Issue:** Customer app `event-edit-form.tsx`, `event-settings.tsx`, `event-detail-tabs.tsx`, and `page.tsx` contained the same stale auto-lifecycle toggle in the edit form. The pre-existing git diff showed these customer app files already had partial changes applied (possibly from the same development session that created the admin changes). Completing the customer app changes was required for TypeScript to compile — the customer `page.tsx` was already passing `recentTransition` and the customer `event-settings.tsx` already had the new interface.
- **Fix:** Updated customer `event-detail-tabs.tsx` to accept `recentTransition` prop, add transition banner, update `EventSettings` call with expanded props, and add `windows` type to event interface.
- **Files modified:** `apps/customer/src/components/events/event-detail-tabs.tsx`, `apps/customer/src/app/(dashboard)/events/[id]/page.tsx`
- **Commits:** 9b08001

## Commits

| Hash | Description |
|------|-------------|
| 9b08001 | feat(38-02): move autoLifecycle to Settings tab with requirements checklist and add transition banner |
| fd3509a | feat(38-02): add Clock icon to event cards and update campaign bulk toggle |

## Self-Check: PASSED

- event-settings.tsx: FOUND
- event-card-list.tsx: FOUND
- campaign-events-tab.tsx: FOUND
- 38-02-SUMMARY.md: FOUND
- Commit 9b08001: FOUND
- Commit fd3509a: FOUND
