---
phase: 39
plan: "02"
subsystem: packages/ui
tags: [refactor, components, shared-abstractions, deduplication]
dependency-graph:
  requires: [39-01]
  provides: [analytics-barrel, campaigns-barrel, bands-barrel, dashboard-barrel]
  affects: [admin-app, customer-app, packages-ui]
tech-stack:
  added:
    - "@tanstack/react-table added to packages/ui dependencies"
    - "@sparkmotion/database added to packages/ui dependencies"
    - "sonner added to packages/ui dependencies"
    - "html2canvas/jspdf added to packages/ui dependencies"
    - "papaparse added to packages/ui dependencies"
  patterns:
    - "optional-prop union pattern for admin/customer divergence (orgs?, orgId?, showDeletedBy?, showOrgColumn?, showAdminKpis?)"
    - "tRPC-coupled components in packages/ui via @/lib/trpc (resolves to app's trpc at transpile time)"
    - "barrel exports: ./analytics ./campaigns ./bands ./dashboard added to packages/ui package.json"
key-files:
  created:
    - packages/ui/src/components/analytics/kpi-cards.tsx
    - packages/ui/src/components/analytics/tap-trend-chart.tsx
    - packages/ui/src/components/analytics/top-events-table.tsx
    - packages/ui/src/components/analytics/export-csv-button.tsx
    - packages/ui/src/components/analytics/index.ts
    - packages/ui/src/components/campaigns/campaign-form-dialog.tsx
    - packages/ui/src/components/campaigns/campaign-trash-button.tsx
    - packages/ui/src/components/campaigns/index.ts
    - packages/ui/src/components/bands/band-trash-button.tsx
    - packages/ui/src/components/bands/reassign-dialog.tsx
    - packages/ui/src/components/bands/band-review-table.tsx
    - packages/ui/src/components/bands/band-detail-dialog-connected.tsx
    - packages/ui/src/components/bands/index.ts
    - packages/ui/src/components/dashboard/recent-events-table.tsx
    - packages/ui/src/components/dashboard/index.ts
  modified:
    - packages/ui/package.json (added 6 deps + 4 barrel exports)
    - packages/ui/src/components/campaigns/campaign-analytics.tsx (replaced data-prop with tRPC-coupled)
    - apps/admin/src/app/(dashboard)/activity/page.tsx
    - apps/admin/src/app/(dashboard)/page.tsx
    - apps/admin/src/components/bands/bands-table.tsx
    - apps/admin/src/components/campaigns/campaign-detail-tabs.tsx
    - apps/admin/src/components/campaigns/campaign-page-actions.tsx
    - apps/admin/src/components/organizations/org-analytics.tsx
    - apps/admin/src/components/organizations/orgs-analytics.tsx
    - apps/customer/src/app/(dashboard)/activity/page.tsx
    - apps/customer/src/app/(dashboard)/page.tsx
    - apps/customer/src/components/bands/bands-table.tsx
    - apps/customer/src/components/campaigns/campaign-detail-tabs.tsx
    - apps/customer/src/components/campaigns/campaign-page-actions.tsx
decisions:
  - "tRPC-coupled components use @/lib/trpc — resolves to app trpc client via transpilePackages"
  - "BandDetailDialogBase (data-prop) kept separate from BandDetailDialog (tRPC-coupled)"
  - "Admin-only analytics (mode-split-chart, window-split-chart, top-orgs-table, recent-orgs) kept local"
  - "campaign-analytics replaced (old CampaignAnalyticsCard data-prop → new CampaignAnalytics tRPC-coupled)"
metrics:
  duration: "~90 minutes (including 4 build iterations to fix missing deps)"
  completed: "2026-03-11"
  tasks: 2
  files: 39
---

# Phase 39 Plan 02: Migrate Remaining Duplicated Components to packages/ui Summary

Migrated all duplicated campaign, analytics, band, and dashboard components from both apps into `packages/ui` with unified props, then updated all app imports to use the new barrel exports and deleted the local copies. Build confirmed clean with 6/6 tasks successful.

## What Was Built

**Task 1: Create packages/ui components**

- **Analytics barrel** (`./analytics`): `KpiCards`, `TapTrendChart`, `TopEventsTable`, `ExportCsvButton` — all tRPC-coupled, unified admin+customer with optional `orgId`, `showAdminKpis`
- **Campaigns barrel** (`./campaigns`): `CampaignFormDialog`, `CampaignTrashButton`, `CampaignAnalytics` — replaced old data-prop `CampaignAnalyticsCard` with tRPC-coupled `CampaignAnalytics`
- **Bands barrel** (`./bands`): `BandTrashButton`, `ReassignDialog`, `BandReviewTable`, `BandDetailDialog` (tRPC-coupled connected version) — plus existing BandCsvUploadDialog, BandDetailDialogBase, getColumns, BandsTableBase, DeleteBandsDialog
- **Dashboard barrel** (`./dashboard`): `RecentEventsTable` with `showOrgColumn?: boolean` prop (admin passes `showOrgColumn`, customer does not)

**Task 2: Update app imports and delete local copies**

- 22 local component files deleted from apps/admin and apps/customer
- All app pages/components updated to import from `@sparkmotion/ui/{domain}` barrels
- Admin-only components kept local: `mode-split-chart`, `window-split-chart`, `top-orgs-table`, `recent-orgs`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BandDetailDialog export name mismatch**
- **Found during:** Task 2 build (first iteration)
- **Issue:** `packages/ui/band-detail-dialog.tsx` exports `BandDetailDialogBase` (data-prop), but `band-review-table.tsx` imported `BandDetailDialog`
- **Fix:** Created `band-detail-dialog-connected.tsx` with tRPC-coupled `BandDetailDialog` that matches the apps' self-fetching pattern
- **Files modified:** `packages/ui/src/components/bands/band-detail-dialog-connected.tsx` (new), `band-review-table.tsx` (import updated), `bands/index.ts` (export added)
- **Commit:** 8c713a4

**2. [Rule 3 - Blocking] Missing package dependencies in packages/ui**
- **Found during:** Task 2 build (iterations 1-3)
- **Issue:** packages/ui didn't have `@tanstack/react-table`, `@sparkmotion/database`, `sonner`, `html2canvas`, `jspdf`, `papaparse` in its package.json — required by newly migrated components
- **Fix:** Added all 6 packages to packages/ui package.json and ran pnpm install
- **Files modified:** `packages/ui/package.json`
- **Commit:** 8c713a4

**3. [Rule 1 - Bug] Stale Next.js build cache**
- **Found during:** Task 2 build (first iteration)
- **Issue:** Build error showed old `@/components/events/event-form` import despite file having been updated to `../events/event-form` — stale `.next` cache
- **Fix:** Cleared `.next` directories in both apps
- **Impact:** None on source code

## Self-Check: PASSED

All key files exist and both task commits verified present.
