---
phase: 24-event-band-management-tab
plan: 03
subsystem: band-management-ui
tags: [ui-consolidation, status-removal, tab-integration]
dependency_graph:
  requires: ["24-01-band-schema"]
  provides: ["bands-tab-ui", "dialog-csv-upload"]
  affects: ["event-detail-pages"]
tech_stack:
  added: []
  patterns: ["dialog-wrapper", "tab-navigation"]
key_files:
  created: []
  modified:
    - apps/admin/src/components/bands/bands-columns.tsx
    - apps/admin/src/components/bands/edit-band-dialog.tsx
    - apps/admin/src/components/bands/band-csv-upload.tsx
    - apps/admin/src/components/events/event-detail-tabs.tsx
    - apps/customer/src/components/bands/bands-columns.tsx
    - apps/customer/src/components/bands/edit-band-dialog.tsx
    - apps/customer/src/components/bands/band-csv-upload.tsx
    - apps/customer/src/components/events/event-detail-tabs.tsx
  deleted:
    - apps/admin/src/app/(dashboard)/events/[id]/bands/page.tsx
    - apps/customer/src/app/(dashboard)/events/[id]/bands/page.tsx
decisions:
  - id: dialog-based-csv-upload
    summary: "Converted BandCsvUpload from Card-based page component to Dialog-based button component"
    rationale: "Required for integration into event detail tab header while preserving 3-step upload flow"
    alternative: "Could have used inline Card in tab but would consume too much vertical space"
  - id: status-ui-removal
    summary: "Removed status column and field from all band UI components"
    rationale: "BandStatus enum removed in 24-01, UI must reflect schema changes"
    alternative: "None - UI must match backend schema"
  - id: bands-tab-position
    summary: "Placed Bands tab between Overview and URL Manager"
    rationale: "Logical flow: view event info → manage bands → configure URLs → view analytics → settings"
    alternative: "Could have placed at end but bands are central to event functionality"
metrics:
  duration: "326s"
  tasks_completed: 2
  files_modified: 8
  files_deleted: 2
  commits: 2
  completed: "2026-02-14T23:31:08Z"
---

# Phase 24 Plan 03: Bands Tab Integration and Status Removal Summary

Band management UI consolidated into event detail Bands tab with status concept completely removed from UI layer.

## What Was Built

### Task 1: Status Removal
Removed the unused BandStatus concept from all band UI components:

**bands-columns.tsx (both apps):**
- Removed `statusVariant` mapping object
- Removed status column from table columns array
- Final columns: Band ID (with auto-assigned badge), Tap Count, Last Tap, Actions

**edit-band-dialog.tsx (both apps):**
- Removed `status` field from Zod schema (now only `bandId`)
- Removed status Select component and related imports
- Removed `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` imports
- Dialog now only shows Band ID input field, Cancel button, and Save button

### Task 2: Bands Tab Integration
Integrated band management into event detail pages as a tab:

**event-detail-tabs.tsx (both apps):**
- Added "bands" tab at position 2 (between Overview and URL Manager)
- Imported `BandsTable` and `BandCsvUpload` components
- Tab displays band count header (e.g. "127 Bands")
- Upload CSV button positioned in header next to band count
- BandsTable rendered in tab content with existing infinite scroll and search

**band-csv-upload.tsx (both apps):**
- Converted from standalone Card-based page component to Dialog-based button component
- Added Dialog wrapper with `open`, `onOpenChange` state management
- Trigger: Button with Upload icon labeled "Upload CSV"
- Preserved existing 3-step flow inside DialogContent:
  - Step 1 (select): File input and Download Template button
  - Step 2 (preview): Validation table with valid/error counts
  - Step 3 (result): Success message with created/skipped counts
- Dialog resets state on close (reset called in `handleOpenChange`)

**Standalone pages deleted:**
- `apps/admin/src/app/(dashboard)/events/[id]/bands/page.tsx`
- `apps/customer/src/app/(dashboard)/events/[id]/bands/page.tsx`

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- **a45d1c6**: `refactor(24-03): remove status column and field from band UI`
  - Removed status column from bands-columns.tsx (both apps)
  - Removed status field from edit-band-dialog.tsx (both apps)
  - Removed Select component imports no longer needed

- **2dfbe7b**: `feat(24-03): add Bands tab to event detail and convert CSV upload to dialog`
  - Added Bands tab between Overview and URL Manager
  - Converted BandCsvUpload to Dialog-based component
  - Deleted standalone bands pages

## Verification Results

All verification criteria passed:

1. No references to BandStatus, DISABLED, LOST, or statusVariant in band components ✓
2. Bands tab renders between Overview and URL Manager in both apps ✓
3. Band count header displays correctly in tab ✓
4. Upload CSV button opens a Dialog with the 3-step flow ✓
5. Standalone /events/[id]/bands pages deleted ✓
6. Infinite scroll and search preserved in bands table within tab ✓
7. Edit dialog only shows Band ID field (no status) ✓
8. TypeScript compilation successful (cleaned stale .next types) ✓

## Technical Notes

**Dialog Pattern:**
- Used shadcn Dialog component for CSV upload wrapper
- Trigger renders as primary Button with Upload icon
- DialogTitle changes based on step: "Upload Bands CSV" → "Preview Import" → "Import Complete"
- Dialog close automatically resets state via `handleOpenChange` handler

**Component Duplication:**
- Changes applied identically to both admin and customer apps
- Follows established pattern of duplicating UI components per app instead of shared package

**State Management:**
- BandCsvUpload maintains internal step state (select, preview, result)
- Dialog open state separate from step state for proper reset behavior
- Download Template remains accessible in select step within dialog

## Self-Check

Verifying key files and commits exist:

### Files Modified
- [x] apps/admin/src/components/bands/bands-columns.tsx - FOUND
- [x] apps/admin/src/components/bands/edit-band-dialog.tsx - FOUND
- [x] apps/admin/src/components/bands/band-csv-upload.tsx - FOUND
- [x] apps/admin/src/components/events/event-detail-tabs.tsx - FOUND
- [x] apps/customer/src/components/bands/bands-columns.tsx - FOUND
- [x] apps/customer/src/components/bands/edit-band-dialog.tsx - FOUND
- [x] apps/customer/src/components/bands/band-csv-upload.tsx - FOUND
- [x] apps/customer/src/components/events/event-detail-tabs.tsx - FOUND

### Files Deleted
- [x] apps/admin/src/app/(dashboard)/events/[id]/bands/page.tsx - DELETED
- [x] apps/customer/src/app/(dashboard)/events/[id]/bands/page.tsx - DELETED

### Commits
- [x] a45d1c6 - FOUND
- [x] 2dfbe7b - FOUND

## Self-Check: PASSED

All files modified/deleted as expected. All commits present.

## Next Steps

Phase 24-03 complete. Next plan (if any) should handle multi-event routing for hub redirect endpoint to support the new compound unique constraint on [bandId, eventId].
