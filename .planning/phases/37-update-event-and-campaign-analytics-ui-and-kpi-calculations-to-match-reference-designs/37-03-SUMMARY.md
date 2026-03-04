---
phase: 37-update-event-and-campaign-analytics-ui-and-kpi-calculations-to-match-reference-designs
plan: 03
subsystem: analytics
tags: [analytics, ui, charts, kpi, recharts, shadcn]
dependency_graph:
  requires: [37-01]
  provides: [campaign analytics reference design layout, multi-select event filter, Nx engagement rate, sparkline card]
  affects: [admin CampaignAnalytics, customer CampaignAnalytics]
tech_stack:
  added: []
  patterns: [multi-select checkbox dropdown with Popover+Checkbox, inline datetime-local pickers, ResponsiveContainer sparkline, manual pie legend rows, Nx multiplier formula]
key_files:
  created: []
  modified:
    - apps/admin/src/components/campaigns/campaign-analytics.tsx
    - apps/customer/src/components/campaigns/campaign-analytics.tsx
decisions:
  - Engagement Rate displayed as Nx multiplier (tapCount/bandCount) replacing old percentage formula from aggregateEngagement
  - Multi-select checkbox dropdown replaces shadcn Select for event filtering — Popover+Checkbox pattern, no new library
  - Inline datetime-local inputs replace calendar popover for custom time range — simpler UX for filter bar
  - Sparkline uses separate campaignEngagementByHour query with no filters to always show full campaign history
  - Pie chart context-switches — single event selected shows window-level tapsByWindow data; all/multi events shows summary.breakdown event-level data
  - Manual legend rows replace ChartLegend/ChartLegendContent below donut chart — no ChartLegend dependency
  - Customer app is byte-for-byte identical to admin; tRPC auto-scopes data via session.user.role
metrics:
  duration: "~10 minutes"
  completed: "2026-03-04"
  tasks_completed: 2
  files_modified: 2
---

# Phase 37 Plan 03: Refactor Campaign Analytics to Reference Design Layout Summary

Full rewrite of CampaignAnalytics in both admin and customer apps: Engagement Overview card with 4 compact KPI cells (including green % badge for Bands Tapped and Nx multiplier for Engagement Rate), Band Activation Progress bar, Tap Activity sparkline, BarChart engagement chart, and 3-column bottom row with multi-select event filter and inline datetime pickers.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Refactor admin CampaignAnalytics component | 4818134 | apps/admin/src/components/campaigns/campaign-analytics.tsx |
| 2 | Mirror refactored CampaignAnalytics to customer app | 092815a | apps/customer/src/components/campaigns/campaign-analytics.tsx |

## What Was Built

**Task 1 — Admin CampaignAnalytics full rewrite:**

The component was rewritten from scratch while keeping the same `CampaignAnalyticsProps` interface.

Key layout changes:
- **Section 1 (top row):** 3/4 + 1/4 grid — left is Engagement Overview card, right is Tap Activity sparkline card
- **Engagement Overview card:** 4-cell compact KPI grid (`grid-cols-2 md:grid-cols-4`)
  - Cell 1: Total Bands (Users icon, `summary.bandCount`)
  - Cell 2: Total Taps (MousePointerClick icon, `summary.tapCount`)
  - Cell 3: Bands Tapped (Users icon, `summary.uniqueBands`) with inline green % badge (`bandsTappedPct = uniqueBands/bandCount * 100`)
  - Cell 4: Engagement Rate (TrendingUp icon) as Nx multiplier (`tapCount/bandCount.toFixed(1) + "x"`)
  - Band Activation Progress bar below cells
- **Tap Activity sparkline:** `ResponsiveContainer` wrapping `LineChart` using full-campaign `campaignEngagementByHour` data (no filters). Peak month footer shows highest-interaction date.
- **Section 2 (detailed analytics):** Filter bar + full-width BarChart + 3-column bottom row
- **Filter bar:** Multi-select Popover+Checkbox dropdown for events, inline `datetime-local` inputs for custom time range, Export button right-aligned
- **Main engagement chart:** Switched from `LineChart` to `BarChart` with `<Bar dataKey="interactions" fill="#FF6B35" radius={[4,4,0,0]} />`
- **Bottom row (3 columns):**
  - Column 1: Taps by Redirect Type — vertical BarChart using `campaignTapsByRedirectType`
  - Column 2: Tap Distribution — donut PieChart with manual legend rows below (no ChartLegend); context-switches between window-level (single event) and event-level (all/multi)
  - Column 3: Registration Growth — LineChart using `campaignRegistrationGrowth` (fixed in Plan 01)

State changes:
- `selectedEventId: string | undefined` → `selectedEventIds: string[]` initialized to `["all"]`
- `selectedWindowId` removed entirely
- `dateRange: DateRange | undefined` removed (replaced by `customFrom/customTo` strings)
- Added `customFrom: string` and `customTo: string` for datetime-local pickers

Removed:
- `StatCard` local function
- `ChartLegend`, `ChartLegendContent` imports
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` imports
- `Megaphone`, `CalendarIcon` imports
- `Calendar` from `@sparkmotion/ui/calendar`
- `DateRange` type import
- `windows.list` query (window selection no longer in campaign analytics)

Added:
- `TrendingUp`, `ChevronDown` from lucide-react
- `Checkbox` from `@sparkmotion/ui/checkbox`
- `ResponsiveContainer` from recharts
- `registrationData` query via `campaignRegistrationGrowth`
- `sparklineData` query via `campaignEngagementByHour` with no filters

**Task 2 — Customer app mirror:**

Copied admin file verbatim to `apps/customer/src/components/campaigns/campaign-analytics.tsx`. The `trpc` import and `ExportAnalyticsButton` import paths are identical because both apps use `@/lib/trpc` and `@/components/analytics/export-analytics-button` with the same alias structure. TypeScript compiled cleanly.

## Verification

- TypeScript: `npx tsc --noEmit -p apps/admin/tsconfig.json` — PASS, zero errors
- TypeScript: `npx tsc --noEmit -p apps/customer/tsconfig.json` — PASS, zero errors
- No `ChartLegend` or `ChartLegendContent` imports in either file
- No `Select`/`SelectContent`/`SelectItem` imports in either file
- Both files contain "Engagement Overview"
- Both files contain Nx multiplier formula (`toFixed(1) + "x"`)
- Both files contain `campaignRegistrationGrowth.useQuery`
- Main engagement chart uses `<BarChart>` (line 445 in admin file)
- No `StatCard` function in either file
- Both files are byte-for-byte identical (confirmed via `diff`)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] apps/admin/src/components/campaigns/campaign-analytics.tsx modified and committed (4818134)
- [x] apps/customer/src/components/campaigns/campaign-analytics.tsx modified and committed (092815a)
- [x] TypeScript compiles for both apps (zero errors)
- [x] "Engagement Overview" present in both files
- [x] Nx multiplier formula present in both files
- [x] `campaignRegistrationGrowth` query present in both files
- [x] `BarChart` is the main engagement chart
- [x] No `StatCard` function remains
- [x] No `ChartLegend`/`ChartLegendContent` imports remain
- [x] No `Select`/`SelectContent` imports remain
- [x] Both files are identical
