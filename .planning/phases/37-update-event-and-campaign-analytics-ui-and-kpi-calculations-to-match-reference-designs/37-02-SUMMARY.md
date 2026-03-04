---
phase: 37-update-event-and-campaign-analytics-ui-and-kpi-calculations-to-match-reference-designs
plan: 02
subsystem: analytics-ui
tags: [analytics, events, ui, recharts, kpi, shadcn]
dependency_graph:
  requires: [37-01]
  provides: [PHASE-37-EVENT-KPI, PHASE-37-EVENT-LAYOUT, PHASE-37-EVENT-CHARTS, PHASE-37-EVENT-FILTERS]
  affects: [apps/admin, apps/customer]
tech_stack:
  added: []
  patterns: [multi-select-checkbox-dropdown, manual-pie-legend, sparkline-without-chartcontainer, inline-datetime-pickers]
key_files:
  created: []
  modified:
    - apps/admin/src/components/events/events-analytics.tsx
    - apps/customer/src/components/events/events-analytics.tsx
decisions:
  - "Multi-select checkbox dropdown replaces single-select Select for window filters — allows spanning multiple windows"
  - "Sparkline uses bare ResponsiveContainer + LineChart without ChartContainer — no axes/grid needed for mini chart"
  - "Manual pie legend rows replace ChartLegend component — matches reference design with color dot + name + percentage"
  - "Customer app is exact copy of admin — tRPC queries auto-scope to org via session role"
  - "customFrom/customTo state uses string type to match datetime-local input value directly"
metrics:
  duration: "~6 minutes"
  completed: "2026-03-04"
  tasks_completed: 2
  files_modified: 2
---

# Phase 37 Plan 02: Refactor EventsAnalytics to Reference Design Summary

Rewrote EventsAnalytics in both apps with Engagement Overview card (5 KPI cells + progress bar), Tap Activity sparkline, BarChart engagement, 3-column bottom row (Redirect Type + Tap Distribution donut with manual legend + Registration Growth), and multi-select checkbox dropdown with inline datetime pickers.

## What Was Built

### Task 1: Admin EventsAnalytics Refactor (commit f28420e)

Full rewrite of `apps/admin/src/components/events/events-analytics.tsx`:

**State changes:**
- `selectedWindowId: string | undefined` → `selectedWindowIds: string[]` initialized to `["all"]`
- Added `customFrom: string` and `customTo: string` for inline datetime pickers
- Added `windowDropdownOpen: boolean` for controlled Popover state

**New layout (top-to-bottom):**
1. Top row `grid-cols-1 lg:grid-cols-4`: Engagement Overview card (col-span-3) + Tap Activity sparkline (col-span-1)
2. Filter bar: multi-select checkbox dropdown + "Or Custom Time" label + two datetime-local inputs + export button
3. Full-width Event Engagement BarChart (was LineChart)
4. 3-column bottom row: Taps by Redirect Type | Tap Distribution donut + manual legend | Registration Growth line chart

**New queries added:**
- `trpc.analytics.registrationGrowth.useQuery(filterParams)` — first-tap growth chart
- `trpc.analytics.engagementByHour.useQuery({ eventId })` — sparkline (always full event, no filters)

**Removed:**
- `StatCard` helper function
- `ChartLegend`, `ChartLegendContent` imports
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` imports
- Old `handleWindowChange` and `clearFilters` functions

### Task 2: Customer App Mirror (commit bdce035)

Exact copy of admin `events-analytics.tsx` to `apps/customer/src/components/events/events-analytics.tsx`. Uses `format()` consistently instead of the old `toISOString()` approach in the customer version.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- TypeScript admin: PASS (0 errors)
- TypeScript customer: PASS (0 errors)
- No `ChartLegend`/`ChartLegendContent` imports: PASS
- No `Select`/`SelectContent`/`SelectItem` imports: PASS
- Both files contain "Engagement Overview": PASS
- Both files contain `trpc.analytics.registrationGrowth.useQuery`: PASS
- Main engagement chart uses `<BarChart data={engagement`: PASS
- No `StatCard` function: PASS
- 96 API tests pass: PASS

## Self-Check: PASSED

Files confirmed:
- `apps/admin/src/components/events/events-analytics.tsx` — exists, contains "Engagement Overview"
- `apps/customer/src/components/events/events-analytics.tsx` — exists, matches admin
- Commits f28420e and bdce035 exist in git log
