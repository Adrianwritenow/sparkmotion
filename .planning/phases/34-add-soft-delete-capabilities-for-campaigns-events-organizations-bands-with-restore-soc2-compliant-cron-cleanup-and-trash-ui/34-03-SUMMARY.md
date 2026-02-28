---
phase: 34-add-soft-delete-capabilities-for-campaigns-events-organizations-bands-with-restore-soc2-compliant-cron-cleanup-and-trash-ui
plan: "03"
subsystem: ui
tags: [trpc, shadcn, sheet, sonner, soft-delete, trash-ui, restore, customer-app]

requires:
  - phase: 34-02
    provides: admin TrashButton components as reference pattern; trashCount/listDeleted/restore/restoreAll tRPC procedures on all 4 routers
  - phase: 34-01
    provides: soft delete schema fields (deletedAt, deletedById, deletedByName) and backend procedures

provides:
  - EventTrashButton (customer): org-scoped trash sheet for deleted events with badge, restore+undo, restoreAll
  - CampaignTrashButton (customer): org-scoped trash sheet for deleted campaigns with badge, restore+undo, restoreAll
  - BandTrashButton (customer): org-scoped trash sheet for deleted bands with conflict-aware restore toasts

affects: []

tech-stack:
  added: []
  patterns:
    - "Customer TrashButton components are functionally identical to admin versions but omit orgId param — backend auto-scopes via ctx.user.orgId for CUSTOMER role"
    - "Customer trash items omit deletedByName display — org-scoped context makes 'deleted by' less relevant than admin cross-org view"

key-files:
  created:
    - apps/customer/src/components/events/event-trash-button.tsx
    - apps/customer/src/components/campaigns/campaign-trash-button.tsx
    - apps/customer/src/components/bands/band-trash-button.tsx
  modified:
    - apps/customer/src/components/events/event-page-actions.tsx
    - apps/customer/src/components/campaigns/campaign-page-actions.tsx
    - apps/customer/src/components/bands/band-review-table.tsx

key-decisions:
  - "Customer TrashButton components omit deletedByName row — customers only see their own org's items, 'deleted by' attribution is less useful in org-scoped context vs admin cross-org view"
  - "Customer BandTrashButton has no orgId prop — backend auto-scopes via ctx.user.orgId; no BandReviewTable org selector exists in customer app"
  - "Phase 34 SOC2 soft-delete requirement fully closed: schema (34-01) + admin UI (34-02) + customer UI (34-03)"

patterns-established:
  - "Phase 8 KISS component duplication confirmed: customer components are independent copies in apps/customer/src/components/, not shared from admin"
  - "Conflict-aware band restore pattern identical across admin and customer: skipped count in restoreAll, per-item warning toast with no undo on conflict"

requirements-completed: []

duration: 10min
completed: 2026-02-28
---

# Phase 34 Plan 03: Customer Trash UI Summary

**3 customer TrashButton Sheet components (events/campaigns/bands) with org-scoped badge counts, restore+undo, restoreAll, and conflict-aware band restore toasts — completing SOC2 soft-delete UI across both admin and customer apps**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-28T22:02:58Z
- **Completed:** 2026-02-28T22:13:15Z
- **Tasks:** 2 (+ checkpoint:human-verify)
- **Files modified:** 6

## Accomplishments

- Created 3 customer TrashButton components mirroring admin versions but without orgId param (backend auto-scopes)
- Integrated all 3 buttons into customer page headers (events, campaigns) and bands filter row
- Customer trash UI is org-scoped by default — customers can only see and restore their own org's deleted items
- Band restore conflict handling is identical to admin: per-item warning when skipped, restoreAll shows count summary

## Task Commits

1. **Task 1: Create customer EventTrashButton and CampaignTrashButton, integrate into page actions** - `f6c38a3` (feat)
2. **Task 2: Create customer BandTrashButton, integrate into customer BandReviewTable** - `2daba6f` (feat)

## Files Created/Modified

- `apps/customer/src/components/events/event-trash-button.tsx` - New: org-scoped Sheet panel for deleted events with badge, restore+undo, restoreAll
- `apps/customer/src/components/campaigns/campaign-trash-button.tsx` - New: same pattern for campaigns
- `apps/customer/src/components/bands/band-trash-button.tsx` - New: conflict-aware Sheet for deleted bands (no orgId prop)
- `apps/customer/src/components/events/event-page-actions.tsx` - Added EventTrashButton before "New Event" button
- `apps/customer/src/components/campaigns/campaign-page-actions.tsx` - Added CampaignTrashButton before "Create Campaign" button
- `apps/customer/src/components/bands/band-review-table.tsx` - Added BandTrashButton at end of filter row

## Decisions Made

- **Customer components omit deletedByName** — customers only see their own org's items; attributing deletes to a specific user is less meaningful when all items belong to the same org. Simpler display without that row.
- **BandTrashButton has no orgId prop** — customer BandReviewTable has no org selector (it's always org-scoped); passing undefined to listDeleted lets backend auto-scope via ctx.user.orgId.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript compiled clean after both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 34 complete: backend (34-01) + admin UI (34-02) + customer UI (34-03)
- SOC2 soft-delete requirement fully closed across all 4 entity types and both apps
- Awaiting human-verify checkpoint to confirm visual/functional correctness in browser

---
*Phase: 34-add-soft-delete-capabilities-for-campaigns-events-organizations-bands-with-restore-soc2-compliant-cron-cleanup-and-trash-ui*
*Completed: 2026-02-28*
