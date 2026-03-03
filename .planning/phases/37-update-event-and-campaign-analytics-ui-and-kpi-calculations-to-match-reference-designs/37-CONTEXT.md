# Phase 37: Update Event and Campaign Analytics UI and KPI Calculations to Match Reference Designs - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the analytics tabs inside event detail pages and campaign detail pages (both admin and customer apps) to match the reference design in `/Users/adrianrodriguez/Downloads/sparkmotion-analytics/`. This covers KPI card layout, chart types, filter controls, and export UI. The global `/analytics` dashboard page is NOT in scope.

</domain>

<decisions>
## Implementation Decisions

### KPI Metrics — Event Analytics
- Replace current 3 separate stat cards with a single "Engagement Overview" card containing 5 compact metric cells:
  1. **Total Bands** — count of bands registered to event (icon: Users)
  2. **Total Taps** — total tap count across all bands (icon: MousePointerClick)
  3. **Bands Tapped** — count of unique bands that have at least 1 tap (icon: Users), with subtitle "Of total bands"
  4. **Engagement** — percentage of bands tapped vs total bands (e.g., "78.9%"), with subtitle showing "982 of 1,245 bands"
  5. **Avg Taps/Band** — total taps / total bands as decimal (e.g., "6.8") (icon: TrendingUp)
- Include **Band Activation Progress** bar below metrics: horizontal bar showing bands tapped / total bands with label "X / Y bands tapped"
- No trend/change badges (+/-%) — skip entirely since no historical comparison data exists
- Grid layout: `grid-cols-2 md:grid-cols-5` for event (5 metrics)

### KPI Metrics — Campaign Analytics
- Same Engagement Overview card pattern but with 4 compact metric cells:
  1. **Total Bands** — sum of bands across all campaign events
  2. **Total Taps** — sum of taps across all campaign events
  3. **Bands Tapped** — unique bands tapped, with inline percentage badge (e.g., green "78.8%")
  4. **Engagement Rate** — displayed as Nx multiplier (avg taps per band, e.g., "6.7x") (icon: TrendingUp)
- Include Band Activation Progress bar
- No trend badges
- Grid layout: `grid-cols-2 md:grid-cols-4` for campaign (4 metrics)

### Engagement Rate Formula
- **Engagement Rate = avg taps per band** displayed as Nx multiplier (total taps / total bands)
- NOT the current percentage formula (bands tapped / total bands)
- The percentage formula moves to the "Bands Tapped" metric cell and "Engagement" metric (event only)

### Analytics Layout Structure
- **Section 1 — Top row (3/4 + 1/4 grid):**
  - Left (3/4): Engagement Overview card with compact KPI cells + progress bar
  - Right (1/4): "Tap Activity" sparkline card — mini LineChart showing tap trend over time, with "Peak Time" or "Peak Month" footer showing peak value
- **Section 2 — Detailed Analytics:**
  - Filter bar: multi-select checkbox dropdown + inline datetime pickers + Export dropdown
  - Full-width engagement BarChart (currently a LineChart — switch to BarChart)
  - 3-column row below:
    1. **Taps by Redirect Type** — vertical BarChart (Pre-Event, Live Event, Post-Event colors)
    2. **Tap Distribution** — donut PieChart with legend below (not inside chart)
    3. **Registration Growth** — LineChart showing first-tap dates per band, broken down by window (event) or by event (campaign)

### Chart Changes
- **Engagement chart**: Switch from LineChart to BarChart, color-coded by window type when window filter is active
- **Registration Growth**: NEW chart — "registration" = first tap of a band in an event, NOT band creation date. Requires new tRPC endpoint to query earliest tap per band grouped by date
- Bar chart colors: use existing REDIRECT_COLORS pattern (PRE/LIVE/POST mapped to chart CSS vars)

### Filter Controls
- Replace single-select shadcn `Select` components with **multi-select checkbox dropdowns**
- Event analytics: checkbox dropdown for windows (All Time + individual windows with WindowType badge)
- Campaign analytics: checkbox dropdown for events (All Events + individual events with color dot + status badge)
- Add **inline datetime pickers** alongside dropdown: "Or Custom Time" label + start datetime + end datetime + clear button
- "All Time" / "All Events" acts as select-all toggle

### Export UI
- Replace current ExportAnalyticsButton with a **dropdown Export button**
- Single "Export" button with ChevronDown icon
- Dropdown options: "Export as CSV" (FileSpreadsheet icon) + "Export as PDF" (FileText icon)
- Positioned in top-right of analytics section header

### Stat Card Presentation
- Each KPI cell: `bg-muted/30 rounded-lg p-2.5 space-y-0.5`
- Cell content: small icon + uppercase tracking-wide label (10-11px) + large bold value (text-xl/2xl) + muted subtitle
- Engagement Overview card header: icon with `bg-primary/15` rounded background + "Engagement Overview" title + contextual subtitle
- Tap Activity sparkline card header: smaller icon with same gradient bg + "Tap Activity" title + subtitle

### Colors and Branding
- Use theme primary color (not hardcoded #FF9D1D/#FF4220 hex values)
- Progress bar: use `bg-primary` or theme-aware gradient
- Icon backgrounds: `bg-primary/15` (or `bg-primary/10`)
- Chart accent: keep existing #FF6B35 for main chart line/bar (already established pattern)

### App Scope
- Apply changes to BOTH admin and customer apps
- Customer analytics identical to admin (same KPIs, charts, filters) — just org-scoped data
- Both event detail analytics tab and campaign detail analytics tab

### Claude's Discretion
- Exact responsive breakpoints for the 3-column chart row
- Whether to extract the Engagement Overview card as a shared component in packages/ui or keep inline
- Exact sparkline data source for Tap Activity card (could use existing velocity/hourly data)
- Multi-select checkbox dropdown implementation (custom component vs library)
- How to handle empty states for new Registration Growth chart

</decisions>

<specifics>
## Specific Ideas

- Reference design app lives at `/Users/adrianrodriguez/Downloads/sparkmotion-analytics/` — full Vite+React reference implementation
- Key reference files: `src/pages/EventDetailsPage.tsx` (analytics tab ~line 2857), `src/pages/CampaignDetailsPage.tsx` (analytics tab ~line 642), `src/components/StatCard.tsx`, `src/components/AnalyticsDashboard.tsx`
- "Registration" in this context means "first tap of a band in an event" — derived from TapLog data (earliest tap per band per event), NOT band creation timestamp
- Campaign engagement bar chart should color-code bars by event (each event gets a distinct color) when "All Events" is selected
- Event engagement bar chart should color-code bars by window type when filtering

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EventsAnalytics` component (`apps/admin/src/components/events/events-analytics.tsx`): Current event analytics — needs major refactor to match reference
- `CampaignAnalytics` component (`apps/admin/src/components/campaigns/campaign-analytics.tsx`): Current campaign analytics — needs major refactor
- `ExportAnalyticsButton` (`apps/admin/src/components/analytics/export-analytics-button.tsx`): Current export — replace with dropdown
- Recharts already installed and used extensively (LineChart, BarChart, PieChart, Cell, Legend)
- shadcn ChartContainer + ChartTooltip patterns established
- `VelocitySparkline` component exists — potential data source pattern for Tap Activity sparkline

### Established Patterns
- tRPC analytics router (`packages/api/src/routers/analytics.ts`): Has `eventSummary`, `campaignSummary`, `engagementByHour`, `tapsByRedirectType`, `tapsByWindow`, `campaignEngagementByHour`, `campaignTapsByRedirectType`
- `getEventEngagement` and `aggregateCampaignEngagement` in `packages/api/src/lib/engagement.ts` for engagement calculations
- Date filtering uses `buildDateFilter()` helper with windowId + from/to params
- Chart colors: `REDIRECT_COLORS` map and `PIE_COLORS` array established
- Customer app mirrors admin app components (near-identical files in both apps)

### Integration Points
- Event detail page: `EventDetailTabs` renders `EventsAnalytics` in "analytics" tab
- Campaign detail page: `CampaignDetailTabs` renders `CampaignAnalytics` in "analytics" tab
- New tRPC endpoint needed: registration growth (first tap per band per event grouped by date)
- New tRPC endpoint needed: "bands tapped" count (unique bands with at least 1 tap for an event/campaign)
- Tap Activity sparkline needs data source (could reuse velocity history or hourly analytics)

</code_context>

<deferred>
## Deferred Ideas

- Update global `/analytics` dashboard page to match reference design patterns — future phase
- AnalyticsDashboard component from reference (welcome header, stat cards with trend badges, recent events table, recent orgs list) — different from event/campaign analytics, could be its own phase

</deferred>

---

*Phase: 37-update-event-and-campaign-analytics-ui-and-kpi-calculations-to-match-reference-designs*
*Context gathered: 2026-03-03*
