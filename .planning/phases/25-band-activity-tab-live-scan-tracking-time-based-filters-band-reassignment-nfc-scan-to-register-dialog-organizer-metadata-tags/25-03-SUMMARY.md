---
phase: 25-band-activity-tab
plan: 03
subsystem: ui, admin, customer
tags: [react, trpc, nfc, shadcn, tags, registration, press-and-hold]

# Dependency graph
requires:
  - phase: 25-01
    provides: bands.register, tags CRUD tRPC procedures, bulkReassign mutation
  - phase: 25-02
    provides: TagBadge pattern, activity-feed filter bar, band-review-table selection banner

provides:
  - NFC scan-to-register dialog (admin + customer) with NDEFReader detection, manual fallback, bucket accumulation, review/complete views
  - Admin tag management UI with 10-color palette, create/edit/delete with inline preview
  - Admin bands page Tags third tab rendering TagsManagement
  - Reassign dialog press-and-hold (3s) confirmation with fill animation and warning in both apps
  - NfcScanRegisterDialog wired into activity-feed filter bars and band-review-table selection banners

affects:
  - Registration desk workflow complete: scan NFC -> bucket -> review name/email/tag -> register

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NDEFReader.scan() called inside user gesture (button click) to satisfy browser security requirement"
    - "AbortController stored in useRef to cancel NFC scan on dialog close or stop button"
    - "Press-and-hold with setInterval + clearInterval + pointer capture for reliable hold detection"
    - "Batch tag application: batchTagId triggers setBucket map to override all tagId fields"
    - "eventId optional on NFC dialog — shows event-select step when not provided, skips it when provided"

key-files:
  created:
    - apps/admin/src/components/bands/nfc-scan-register-dialog.tsx
    - apps/admin/src/components/tags/tags-management.tsx
    - apps/customer/src/components/bands/nfc-scan-register-dialog.tsx
  modified:
    - apps/admin/src/app/(dashboard)/bands/page.tsx
    - apps/admin/src/components/bands/reassign-dialog.tsx
    - apps/customer/src/components/bands/reassign-dialog.tsx
    - apps/admin/src/components/bands/activity-feed.tsx
    - apps/admin/src/components/bands/band-review-table.tsx
    - apps/customer/src/components/bands/activity-feed.tsx
    - apps/customer/src/components/bands/band-review-table.tsx

key-decisions:
  - "NFC dialog eventId is optional — shows event-select step first when not provided (activity feed passes selected eventId, band-review-table passes none)"
  - "Duplicate NFC dialog per-app (admin/customer) per established Phase 8 KISS over DRY pattern"
  - "Press-and-hold uses 3s timer (vs 5s in delete dialog) — reassign is reversible in theory, requires strong but not maximum confirmation"
  - "activityFeed.invalidate() added to bulkReassign onSuccess — tap history cleared on reassign, so feed should refresh"
  - "TagsManagement as third tab in admin bands page — keeps tag CRUD accessible without cluttering activity/bands views"

# Metrics
duration: 6min
completed: 2026-02-22
---

# Phase 25 Plan 03: NFC Scan-to-Register Dialog, Tag Management, and Press-and-Hold Reassign Summary

**NFC scan-to-register workflow (scan -> bucket -> review name/email/tag per band -> register) in both apps, admin-only tag CRUD with color palette, and 3-second press-and-hold reassign confirmation with tap history deletion warning**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-02-22T17:51:46Z
- **Completed:** 2026-02-22T17:57:17Z
- **Tasks:** 2
- **Files modified:** 11 (3 created new, 8 modified)

## Accomplishments

- Created admin NFC scan-to-register dialog (454 lines): NDEFReader detection with manual entry fallback, bucket accumulation with deduplication, review view with per-band name/email/tag inline fields, batch tag assignment at top of review, complete view with count and register-more flow
- Created customer NFC scan-to-register dialog (453 lines): identical to admin — customers can assign tags from system-wide list (tags.list is protectedProcedure per Plan 01 decision) but no tag management UI
- Created admin TagsManagement component (319 lines): 10-color predefined palette (#ef4444 through #6b7280), create/edit/delete with Dialog-based forms, live tag badge preview, P2002/CONFLICT error handling
- Updated admin bands page: added third "Tags" tab rendering TagsManagement
- Updated admin and customer ReassignDialog: replaced simple button with 3-second press-and-hold pattern using setInterval + pointer capture, visual fill animation, countdown timer, orange warning message about tap history deletion
- Also added `utils.bands.activityFeed.invalidate()` to reassign onSuccess since tap logs are deleted on reassign
- Wired NfcScanRegisterDialog into admin and customer activity-feed filter bars (passes eventId when event is selected)
- Wired NfcScanRegisterDialog into admin and customer band-review-table selection banners and added standalone "Register Bands" button above the filter row

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin NFC scan-to-register dialog and tag management UI** - `a5464af` (feat)
2. **Task 2: Customer NFC dialog, press-and-hold reassign, NFC trigger integration** - `c10091e` (feat)

## Files Created/Modified

- `apps/admin/src/components/bands/nfc-scan-register-dialog.tsx` - NFC scan dialog with NDEFReader, manual fallback, bucket, review, complete views
- `apps/admin/src/components/tags/tags-management.tsx` - Admin tag CRUD with 10-swatch color palette
- `apps/admin/src/app/(dashboard)/bands/page.tsx` - Added Tags third tab with TagsManagement
- `apps/admin/src/components/bands/reassign-dialog.tsx` - Press-and-hold 3s confirmation, activityFeed invalidation, warning message
- `apps/customer/src/components/bands/nfc-scan-register-dialog.tsx` - Customer NFC dialog (duplicate of admin, no tag management)
- `apps/customer/src/components/bands/reassign-dialog.tsx` - Same press-and-hold enhancement
- `apps/admin/src/components/bands/activity-feed.tsx` - NfcScanRegisterDialog imported and mounted in filter bar
- `apps/admin/src/components/bands/band-review-table.tsx` - NfcScanRegisterDialog in action bar and selection banner
- `apps/customer/src/components/bands/activity-feed.tsx` - NfcScanRegisterDialog in filter bar
- `apps/customer/src/components/bands/band-review-table.tsx` - NfcScanRegisterDialog in action bar and selection banner

## Decisions Made

- **eventId optional on NFC dialog** — Dialog shows an event-select step first when no eventId is provided (used from Bands tab). When eventId is passed (from Activity tab event filter), the step is skipped and scanning starts immediately.
- **Duplicate NFC dialog per-app** — Following established Phase 8 pattern: KISS over DRY. Admin and customer dialogs are separate files for potential future app-specific customization.
- **3s press-and-hold for reassign (vs 5s for delete)** — Reassign is a significant action (deletes tap history) but the bands remain in the system. Delete dialogs use 5s. 3s balances safety with usability at a busy registration desk.
- **activityFeed.invalidate() added to reassign onSuccess** — The reassign mutation deletes all TapLog records for the reassigned bands. The activity feed must refresh to reflect this data loss.
- **Tags tab in admin bands page** — Admin-only tag management rendered in a dedicated tab alongside Activity and Bands. Clean separation without cluttering the primary views.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- Phase 25 is now complete: all 3 plans executed
- Full registration desk workflow is operational: NFC scan or manual entry -> bucket accumulation -> review with name/email/tag per band -> batch register
- Admin tag management allows creating/editing/deleting system-wide tags with colored badges
- Reassign requires intentional 3-second hold, with clear warning about tap history deletion
- Both admin and customer apps have equivalent NFC registration capability (customer app excludes tag management per decision)

---
*Phase: 25-band-activity-tab*
*Completed: 2026-02-22*

## Self-Check: PASSED

All 10 key files found on disk. Both task commits (a5464af, c10091e) verified in git log.
