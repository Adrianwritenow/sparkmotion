---
phase: 38-update-auto-lifecycle-to-use-next-event-start-time-instead-of-event-start-end-dates
plan: "03"
subsystem: customer-ui
tags: [auto-lifecycle, event-settings, event-cards, campaign-ui, customer-app, ui]
dependency_graph:
  requires: ["38-01", "38-02"]
  provides: ["auto-lifecycle-customer-ui"]
  affects: ["customer-event-settings", "customer-event-cards", "customer-campaign-events-tab", "customer-event-detail-tabs"]
tech_stack:
  added: []
  patterns:
    - "Component duplication pattern (admin/customer) per established Phase 8 KISS pattern"
key_files:
  created: []
  modified:
    - "apps/customer/src/components/events/event-edit-form.tsx"
    - "apps/customer/src/components/events/event-settings.tsx"
    - "apps/customer/src/components/events/event-detail-tabs.tsx"
    - "apps/customer/src/app/(dashboard)/events/[id]/page.tsx"
    - "apps/customer/src/components/events/event-card-list.tsx"
    - "apps/customer/src/components/campaigns/campaign-events-tab.tsx"
decisions:
  - "All customer app changes were pre-implemented during 38-02 execution due to TypeScript compilation dependency; 38-03 only needed the campaign-events-tab description and toast update"
metrics:
  duration: "included in 38-02 execution"
  completed: "2026-03-09"
  tasks_completed: 3
  files_modified: 6
---

# Phase 38 Plan 03: Customer App Auto-Lifecycle UI Mirror Summary

Customer app fully mirrors admin auto-lifecycle UI: toggle moved from edit form to Settings tab with requirements checklist, Clock icon on event cards, dismissible transition banner in Overview, campaign bulk toggle description updated to reflect window-based chain behavior.

## What Was Built

All tasks from this plan were implemented during Plan 38-02 execution as an automatic deviation (Rule 2: auto-add missing critical functionality), since the customer app files had partial changes that required completion for TypeScript to compile.

### Task 1: Remove autoLifecycle from edit form, add to Settings with requirements checklist
- Same removals applied to customer `event-edit-form.tsx` as admin
- Same auto-lifecycle toggle section added to customer `event-settings.tsx` as first section

### Task 2: Transition banner in Overview, new props through page and tabs
- Same `db.changeLog.findFirst` query added to customer `page.tsx`
- Same dismissible transition banner added to customer `event-detail-tabs.tsx`
- Same expanded event props passed to customer `EventSettings`

### Task 3: Clock icon on event cards, campaign bulk toggle update
- Same Clock icon with tooltip added to customer `event-card-list.tsx`
- Same TooltipProvider wrapping pattern applied
- Customer `campaign-events-tab.tsx` description updated in this plan
- Customer `campaign-events-tab.tsx` mutation `onSuccess` updated to handle `{ updated, skipped }` toast

## Deviations from Plan

None — all work was pre-completed during Plan 38-02 per Rule 2 (missing critical functionality required for TypeScript compilation). Remaining customer `campaign-events-tab.tsx` updates committed in this plan.

## Commits

| Hash | Description |
|------|-------------|
| 9b08001 | feat(38-02): move autoLifecycle to Settings tab (customer files included) |
| c42377a | feat(38-03): mirror auto-lifecycle admin UI changes in customer app |

## Self-Check: PASSED

- customer event-settings.tsx has Auto-Lifecycle: CONFIRMED
- customer event-card-list.tsx has Clock icon: CONFIRMED
- customer campaign-events-tab.tsx has "first window starts": CONFIRMED
- customer page.tsx has changeLog.findFirst: CONFIRMED
- customer event-detail-tabs.tsx has transitionDismissed: CONFIRMED
- TypeScript compiles clean: CONFIRMED
