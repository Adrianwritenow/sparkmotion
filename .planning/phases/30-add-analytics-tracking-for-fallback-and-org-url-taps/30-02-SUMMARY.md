---
phase: 30-add-analytics-tracking-for-fallback-and-org-url-taps
plan: 02
subsystem: analytics-ui
tags: [analytics, charts, ui, recharts, trpc, redirect-types]
dependency_graph:
  requires: [tapsByRedirectType, campaignTapsByRedirectType]
  provides: [CHARTS-REDIRECT-TYPE-RENAME, FILTER-DROPDOWN-EXTENSION, MUTED-COLORS-NON-WINDOW, COMPONENT-DUPLICATION-ADMIN-CUSTOMER]
  affects: [apps/admin/components/events, apps/admin/components/campaigns, apps/customer/components/events, apps/customer/components/campaigns]
tech_stack:
  added: []
  patterns: [REDIRECT_COLORS-record-per-bar-Cell, pseudo-ID-filter-startsWith, component-duplication-admin-customer]
key_files:
  created: []
  modified:
    - apps/admin/src/components/events/events-analytics.tsx
    - apps/customer/src/components/events/events-analytics.tsx
    - apps/admin/src/components/campaigns/campaign-analytics.tsx
    - apps/customer/src/components/campaigns/campaign-analytics.tsx
decisions:
  - REDIRECT_COLORS record keyed by category string for per-bar Cell fill — cleaner than index-based PIE_COLORS for named categories
  - campaignTapsByRedirectType always used for bar chart (no selectedEventId conditional) — procedure accepts eventId param so handles both cases
  - barData/isLoading conditional removed from campaign analytics — simpler single source of truth for bar chart
  - tapsByWindow retained for pie chart and export — window-level breakdown still valid, only bar chart switches to redirect-type granularity
  - Pseudo-IDs (__FALLBACK__, __ORG__, __DEFAULT__) filter pie chart naturally (no real window matches) — no handler change needed
metrics:
  duration_minutes: 7
  completed: "2026-02-26T18:43:32Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 30 Plan 02: Analytics UI Redirect Type Charts Summary

All 4 analytics components updated to show PRE/LIVE/POST/FALLBACK/ORG/DEFAULT redirect categories in bar chart with muted gray tones for non-window types; filter dropdown extended to "All Redirects" with pseudo-ID options.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Update event analytics components (admin + customer) | a8431b8 | apps/admin/src/components/events/events-analytics.tsx, apps/customer/src/components/events/events-analytics.tsx |
| 2 | Update campaign analytics components (admin + customer) | 3c518fe | apps/admin/src/components/campaigns/campaign-analytics.tsx, apps/customer/src/components/campaigns/campaign-analytics.tsx |

## What Was Built

### Task 1: Event Analytics Components Updated

Applied identical changes to both `apps/admin/src/components/events/events-analytics.tsx` and `apps/customer/src/components/events/events-analytics.tsx` (component duplication pattern).

**REDIRECT_COLORS constant added:**
```typescript
const REDIRECT_COLORS: Record<string, string> = {
  PRE: "hsl(var(--chart-1))",
  LIVE: "hsl(var(--chart-2))",
  POST: "hsl(var(--chart-3))",
  FALLBACK: "hsl(215 20% 65%)",
  ORG: "hsl(215 15% 55%)",
  DEFAULT: "hsl(215 10% 45%)",
};
```

**New query added alongside existing tapsByWindow:**
```typescript
const { data: redirectTypeData, isLoading: redirectTypeLoading } =
  trpc.analytics.tapsByRedirectType.useQuery({ eventId, from: filterParams.from, to: filterParams.to });
```

**Bar chart data now from tapsByRedirectType:**
```typescript
const barData = (redirectTypeData ?? []).map((item) => ({
  type: item.category,
  count: item.count,
}));
```

**Per-bar Cell coloring:**
```tsx
<Bar dataKey="count" radius={[4, 4, 0, 0]}>
  {barData.map((item, i) => (
    <Cell key={i} fill={REDIRECT_COLORS[item.type] ?? "hsl(var(--muted-foreground))"} />
  ))}
</Bar>
```

**Filter dropdown extended:**
```tsx
<SelectItem value="all">All Redirects</SelectItem>
<SelectItem value="__FALLBACK__">FALLBACK</SelectItem>
<SelectItem value="__ORG__">ORG</SelectItem>
<SelectItem value="__DEFAULT__">DEFAULT</SelectItem>
{windows?.map(...)}
```

**Chart renames:**
- Bar: "Taps by Window Type" → "Taps by Redirect Type", subtitle removed window list
- Pie: "Taps by Window" → "Tap Distribution", subtitle → "Tap distribution across redirect destinations"

**Admin date formatting preserved** (`format(date, "yyyy-MM-dd'T'00:00:00.000'Z'")`); customer uses `toISOString()`.

### Task 2: Campaign Analytics Components Updated

Applied identical changes to both `apps/admin/src/components/campaigns/campaign-analytics.tsx` and `apps/customer/src/components/campaigns/campaign-analytics.tsx`.

**tapsByWindowType fully replaced by campaignTapsByRedirectType:**
```typescript
const { data: redirectTypeData, isLoading: redirectTypeLoading } =
  trpc.analytics.campaignTapsByRedirectType.useQuery({
    campaignId,
    eventId: selectedEventId,
    from: filterParams.from,
    to: filterParams.to,
  });
```

**Simplified bar chart data (no selectedEventId conditional):**
```typescript
const barChartData = (redirectTypeData ?? []).map((item) => ({ type: item.category, count: item.count }));
const barChartLoading = redirectTypeLoading;
```

The old `barData` IIFE derivation from `filteredWindowTaps` and the `chartData = selectedEventId ? barData : windowTypeData` conditional are both removed — `campaignTapsByRedirectType` accepts `eventId` and handles both cases.

**Window filter dropdown (event-selected only) extended to "All Redirects"** with FALLBACK/ORG/DEFAULT pseudo-options.

**Chart renames:**
- Bar: "Taps by Window Type" → "Taps by Redirect Type"
- Event-selected pie: "Taps by Window" → "Tap Distribution"
- "Taps by Event" pie (no event selected): unchanged

**Empty state messages updated:**
- Bar: "No redirect data available"
- Pie: `isRedirectFilter ? "Non-window redirect types have no individual breakdown" : "No window data available"`

## Decisions Made

1. **REDIRECT_COLORS record keyed by category string** — Cleaner than index-based PIE_COLORS for named categories. Fallback to `hsl(var(--muted-foreground))` handles any future unknown categories gracefully.

2. **campaignTapsByRedirectType always used for bar chart** — The procedure already accepts `eventId?: string` and filters appropriately. Removing the `selectedEventId ? barData : windowTypeData` conditional simplifies the component and eliminates a now-redundant code path.

3. **tapsByWindow retained for pie chart and export** — Per-window breakdown is still valuable for identifying which specific window slots drove taps. Redirect type and window-level data serve different purposes.

4. **Pseudo-ID filter approach (`__FALLBACK__`, `__ORG__`, `__DEFAULT__`)** — Filters the pie chart naturally since no real window ID matches these strings. No change to `handleWindowChange` required. Clean, zero-overhead approach.

## Deviations from Plan

None — plan executed exactly as written. The simplification noted in Task 2 step 7 (removing the `selectedEventId` conditional from `barChartData`) was explicitly called out in the plan as the preferred approach.

## Verification Results

1. `grep -c "tapsByRedirectType|campaignTapsByRedirectType" [all 4 files]` → 2 matches each (definition + query call)
2. `grep "Taps by Redirect Type" [all 4 files]` → all 4 contain the renamed bar chart title
3. `grep "All Redirects" [all 4 files]` → all 4 contain the renamed dropdown
4. `grep "REDIRECT_COLORS" [all 4 files]` → 8 total matches (2 per file: definition + Cell usage)
5. `pnpm build --filter @sparkmotion/admin --filter @sparkmotion/customer` → 4 tasks successful, no TypeScript errors

## Self-Check: PASSED
