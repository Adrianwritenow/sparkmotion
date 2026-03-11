"use client";

import { useMemo, useRef } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../ui/chart";
import { Skeleton } from "../ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Tooltip as ShadTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "../ui/tooltip";
import {
  Users,
  MousePointerClick,
  Activity,
  TrendingUp,
  ChevronDown,
  Info,
} from "lucide-react";
import { ExportAnalyticsButton } from "../analytics/export-analytics-button";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

/** Golden-angle HSL color — maximally distinct for any number of series */
function getDistinctColor(index: number): string {
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue}, 70%, 55%)`;
}

export interface CampaignAnalyticsEventName {
  id: string;
  name: string;
}

export interface CampaignEngagementRow {
  date: string;
  interactions: number;
  eventId: string;
}

export interface CampaignSummary {
  bandCount: number;
  tapCount: number;
  uniqueBands: number;
  estimatedAttendees?: number | null;
  breakdown?: Array<{
    eventId: string;
    name: string;
    tapCount: number;
    bandCount?: number;
    engagementPercent?: number;
    location?: string | null;
  }>;
}

export interface CampaignRegistrationRow {
  date: string;
  count: number;
  eventId: string;
}

export interface WindowTapRow {
  windowType: string;
  title?: string | null;
  count: number;
}

export interface UniqueTapsRow {
  date: string;
  eventId: string;
  uniqueCount: number;
}

interface CampaignAnalyticsCardProps {
  campaignName: string;
  orgName: string;
  eventNames: CampaignAnalyticsEventName[];
  selectedEventIds: string[];
  onSelectEvent: (id: string) => void;
  engagement?: CampaignEngagementRow[] | null;
  engagementLoading?: boolean;
  summary?: CampaignSummary | null;
  summaryLoading?: boolean;
  overviewSummary?: CampaignSummary | null;
  overviewLoading?: boolean;
  registrationData?: CampaignRegistrationRow[] | null;
  registrationLoading?: boolean;
  windowTaps?: WindowTapRow[] | null;
  windowTapsLoading?: boolean;
  sparklineRaw?: CampaignEngagementRow[] | null;
  uniqueTapsData?: UniqueTapsRow[] | null;
  uniqueTapsLoading?: boolean;
  uniqueTapsUnfiltered?: UniqueTapsRow[] | null;
}

export function CampaignAnalyticsCard({
  campaignName,
  orgName,
  eventNames,
  selectedEventIds,
  onSelectEvent,
  engagement,
  engagementLoading,
  summary,
  summaryLoading,
  overviewSummary,
  overviewLoading,
  registrationData,
  registrationLoading,
  windowTaps,
  windowTapsLoading,
  sparklineRaw,
  uniqueTapsData,
  uniqueTapsLoading,
  uniqueTapsUnfiltered,
}: CampaignAnalyticsCardProps) {
  const captureRef = useRef<HTMLDivElement>(null);

  // Random color map: stable within session, randomized on refresh
  const colorMapRef = useRef(new Map<string, string>());
  const eventColorMap = useMemo(() => {
    eventNames.forEach((ev, i) => {
      if (!colorMapRef.current.has(ev.id)) {
        colorMapRef.current.set(ev.id, getDistinctColor(i));
      }
    });
    return colorMapRef.current;
  }, [eventNames]);

  // Derive filter params
  const activeEventIds = selectedEventIds.includes("all") ? [] : selectedEventIds;
  const singleEventId = activeEventIds.length === 1 ? activeEventIds[0] : undefined;

  // Sparkline: always full campaign history, no filters
  const sparklineData = (() => {
    if (!sparklineRaw || sparklineRaw.length === 0) return undefined;
    const byDate = new Map<string, number>();
    for (const row of sparklineRaw) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.interactions);
    }
    return Array.from(byDate.entries()).map(([date, interactions]) => ({
      date,
      interactions,
    }));
  })();

  // Pivot engagement data into wide format: { date, [eventId]: count }
  const engagementWide = (() => {
    if (!engagement || engagement.length === 0) return [];
    const byDate = new Map<string, Record<string, number>>();
    for (const row of engagement) {
      if (!byDate.has(row.date)) byDate.set(row.date, {});
      const entry = byDate.get(row.date)!;
      entry[row.eventId] = row.interactions;
    }
    return Array.from(byDate.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
  })();

  // Dynamic engagement chart config from eventNames
  const engagementBarConfig = Object.fromEntries(
    eventNames.map((ev) => [
      ev.id,
      { label: ev.name, color: eventColorMap.get(ev.id) ?? "#FF6B35" },
    ]),
  ) satisfies ChartConfig;

  // Derived KPI values (from unfiltered overview)
  const engagementRate =
    overviewSummary && overviewSummary.bandCount > 0
      ? `${(overviewSummary.tapCount / overviewSummary.bandCount).toFixed(1)}x`
      : "0.0x";

  const bandsTappedPct =
    overviewSummary && overviewSummary.bandCount > 0
      ? Math.round((overviewSummary.uniqueBands / overviewSummary.bandCount) * 100)
      : 0;

  const campaignEstimatedAttendees = overviewSummary?.estimatedAttendees ?? null;
  const activationDenom =
    campaignEstimatedAttendees && campaignEstimatedAttendees > 0
      ? campaignEstimatedAttendees
      : (overviewSummary?.bandCount ?? 0);
  const activationPct =
    overviewSummary && activationDenom > 0
      ? Math.min(
          Math.round((overviewSummary.uniqueBands / activationDenom) * 100),
          100,
        )
      : 0;

  // Sparkline peak
  const peak = sparklineData?.reduce(
    (max, d) => (d.interactions > (max?.interactions ?? 0) ? d : max),
    undefined as (typeof sparklineData)[number] | undefined,
  );

  // Filter bar label
  const selectionText = selectedEventIds.includes("all")
    ? "All Events"
    : `${activeEventIds.length} event${activeEventIds.length > 1 ? "s" : ""} selected`;

  // Pie chart data
  const pieSource = singleEventId
    ? (windowTaps ?? []).map((w) => ({
        name: `${w.windowType} - ${w.title || "Untitled"}`,
        value: w.count,
        eventId: undefined as string | undefined,
      }))
    : (summary?.breakdown ?? []).map((e) => ({
        name: e.name,
        value: e.tapCount,
        eventId: e.eventId,
      }));
  const pieTotal = pieSource.reduce((s, d) => s + d.value, 0);
  const pieLoading = singleEventId ? windowTapsLoading : summaryLoading;

  // Taps by Event bar data — derived from summary breakdown
  const tapsByEventData = (summary?.breakdown ?? []).map((e) => ({
    name: e.name,
    count: e.tapCount,
    eventId: e.eventId,
  }));

  // Registration Growth — pivot per-event data into wide format
  const registrationWide = (() => {
    if (!registrationData || registrationData.length === 0) return [];
    const byDate = new Map<string, Record<string, number>>();
    for (const row of registrationData) {
      if (!byDate.has(row.date)) byDate.set(row.date, {});
      const entry = byDate.get(row.date)!;
      entry[row.eventId] = row.count;
    }
    return Array.from(byDate.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
  })();

  // Dynamic registration chart config from eventNames
  const registrationConfig = Object.fromEntries(
    eventNames.map((ev) => [
      ev.id,
      { label: ev.name, color: eventColorMap.get(ev.id) ?? "#FF6B35" },
    ]),
  ) satisfies ChartConfig;

  // ── Unique Taps Timeline ──
  // Pivot unique taps into wide format: { date, [eventId]: uniqueCount }
  const uniqueTapsWide = useMemo(() => {
    if (!uniqueTapsData || uniqueTapsData.length === 0) return [];
    const byDate = new Map<string, Record<string, number>>();
    const evIds = new Set<string>();
    for (const row of uniqueTapsData) {
      if (!byDate.has(row.date)) byDate.set(row.date, {});
      byDate.get(row.date)![row.eventId] = row.uniqueCount;
      evIds.add(row.eventId);
    }
    const rows = Array.from(byDate.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
    if (rows.length === 1) {
      const zeros = Object.fromEntries([...evIds].map((id) => [id, 0]));
      rows.unshift({ date: "", ...zeros });
      rows.push({ date: " ", ...zeros });
    }
    return rows;
  }, [uniqueTapsData]);

  // Unique taps chart config
  const uniqueTapsConfig = Object.fromEntries(
    eventNames.map((ev) => [
      ev.id,
      { label: ev.name, color: eventColorMap.get(ev.id) ?? "#FF6B35" },
    ]),
  ) satisfies ChartConfig;

  // Unique taps aggregates (from unfiltered data for summary card)
  const uniqueTapsAggregates = useMemo(() => {
    const src = uniqueTapsUnfiltered;
    if (!src || src.length === 0)
      return {
        total: 0,
        dailyTotals: [] as { date: string; total: number }[],
        peakDay: null as { date: string; total: number } | null,
      };
    const byDate = new Map<string, number>();
    let total = 0;
    for (const row of src) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.uniqueCount);
      total += row.uniqueCount;
    }
    const dailyTotals = Array.from(byDate.entries()).map(([date, count]) => ({
      date,
      total: count,
    }));
    const peakDay = dailyTotals.reduce<{ date: string; total: number } | null>(
      (max, d) => (!max || d.total > max.total ? d : max),
      null,
    );
    return { total, dailyTotals, peakDay };
  }, [uniqueTapsUnfiltered]);

  return (
    <div className="space-y-8" ref={captureRef}>
      {/* ── ANALYTICS OVERVIEW ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Analytics Overview</h2>
          <ExportAnalyticsButton
            entityName={campaignName}
            orgName={orgName}
            summary={summary}
            engagement={engagement?.map((row) => ({
              date: row.date,
              interactions: row.interactions,
            }))}
            windowTaps={windowTaps?.map((w) => ({
              name: w.title || w.windowType,
              count: w.count,
            }))}
            captureRef={captureRef}
          />
        </div>

        {/* Top row — 3/4 Engagement Overview + 1/4 Tap Activity sparkline */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left: Engagement Overview card (3/4) */}
          <div className="lg:col-span-3 bg-card border border-border rounded-lg p-6">
            {/* Card header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-primary/15 rounded-md">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Engagement Overview
                </h3>
                <p className="text-xs text-muted-foreground">
                  Campaign-wide engagement metrics
                </p>
              </div>
            </div>

            {/* 4-cell KPI grid */}
            {overviewLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Cell 1: Total Bands */}
                <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Total Bands
                    </span>
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {(overviewSummary?.bandCount ?? 0).toLocaleString()}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    Across all events
                  </span>
                </div>

                {/* Cell 2: Total Taps */}
                <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <MousePointerClick className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Total Taps
                    </span>
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {(overviewSummary?.tapCount ?? 0).toLocaleString()}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    All interactions
                  </span>
                </div>

                {/* Cell 3: Bands Tapped with green % badge */}
                <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Bands Tapped
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-xl font-bold text-foreground">
                      {(overviewSummary?.uniqueBands ?? 0).toLocaleString()}
                    </p>
                    <span className="text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                      {bandsTappedPct}%
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Of total bands
                  </span>
                </div>

                {/* Cell 4: Engagement Rate as Nx multiplier */}
                <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Engagement Rate
                    </span>
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    {engagementRate}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    Avg taps per band
                  </span>
                </div>
              </div>
            )}

            {/* Band Activation Progress bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  Band Activation Progress
                  <TooltipProvider>
                    <ShadTooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {campaignEstimatedAttendees
                            ? "Bands activated / estimated attendees (aggregated across events)"
                            : "Bands activated / total bands assigned"}
                        </p>
                      </TooltipContent>
                    </ShadTooltip>
                  </TooltipProvider>
                </span>
                <span className="text-xs font-medium text-foreground">
                  {(overviewSummary?.uniqueBands ?? 0).toLocaleString()} /{" "}
                  {activationDenom.toLocaleString()} {campaignEstimatedAttendees ? "attendees" : "bands"} activated
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${activationPct}%`,
                    background: "linear-gradient(90deg, #FF6B35 0%, #CC4A1A 100%)",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Right: Tap Activity sparkline (1/4) */}
          <div className="bg-card border border-border rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-primary/15 rounded-md">
                <Activity className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Tap Activity
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Campaign trend
                </p>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              {sparklineData && sparklineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart
                    data={sparklineData}
                    margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
                  >
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]!.payload as { date: string; interactions: number };
                        return (
                          <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                            <p className="font-medium">{d.date}</p>
                            <p className="text-muted-foreground">
                              {d.interactions.toLocaleString()} taps
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="interactions"
                      stroke="#FF6B35"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[100px] flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">No data yet</span>
                </div>
              )}
            </div>

            {peak && (
              <div className="mt-3 pt-3 border-t border-border flex items-baseline justify-between">
                <span className="text-[10px] text-muted-foreground">Peak Month</span>
                <span className="text-xs font-medium text-foreground">
                  {peak.date} &middot; {peak.interactions.toLocaleString()} taps
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── DETAILED ANALYTICS ── */}
      <section>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <h2 className="text-xl font-bold">Detailed Analytics</h2>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal min-w-[160px]">
                <span className="flex-1 truncate">{selectionText}</span>
                <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50"
                onClick={() => onSelectEvent("all")}
              >
                <Checkbox
                  id="event-all"
                  checked={selectedEventIds.includes("all")}
                  onCheckedChange={() => onSelectEvent("all")}
                />
                <label htmlFor="event-all" className="text-sm cursor-pointer flex-1">All Events</label>
              </div>
              {eventNames && eventNames.length > 0 && (
                <>
                  <div className="my-1.5 border-t border-border" />
                  {eventNames.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelectEvent(ev.id)}
                    >
                      <Checkbox
                        id={`event-${ev.id}`}
                        checked={selectedEventIds.includes(ev.id)}
                        onCheckedChange={() => onSelectEvent(ev.id)}
                      />
                      <label htmlFor={`event-${ev.id}`} className="text-sm cursor-pointer flex-1 truncate">
                        {ev.name}
                      </label>
                    </div>
                  ))}
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Full-width engagement BarChart */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">Event Engagement</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {singleEventId ? "Selected event only" : "All events combined"}
            </p>
          </div>
          {engagementLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : engagementWide.length > 0 ? (
            <ChartContainer config={engagementBarConfig} className="h-72 w-full">
              <BarChart data={engagementWide}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                {eventNames.map((ev) => (
                  <Bar
                    key={ev.id}
                    dataKey={ev.id}
                    name={ev.name}
                    fill={eventColorMap.get(ev.id) ?? "#FF6B35"}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No engagement data available
            </p>
          )}
        </div>

        {/* 3-column bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Column 1: Tap Distribution */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-foreground">Tap Distribution</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {singleEventId ? "Tap distribution by window" : "Tap distribution by event"}
              </p>
            </div>
            {pieLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : pieSource.length > 0 && pieTotal > 0 ? (
              <>
                <ChartContainer config={{}} className="h-40 w-full">
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => `${Number(value).toLocaleString()} taps`}
                        />
                      }
                    />
                    <Pie
                      data={pieSource}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {pieSource.map((item, i) => (
                        <Cell
                          key={i}
                          fill={
                            item.eventId
                              ? eventColorMap.get(item.eventId) ?? PIE_COLORS[i % PIE_COLORS.length]
                              : PIE_COLORS[i % PIE_COLORS.length]
                          }
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="space-y-2 mt-2">
                  {pieSource.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: item.eventId
                              ? eventColorMap.get(item.eventId) ?? PIE_COLORS[i % PIE_COLORS.length]
                              : PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                        <span className="text-muted-foreground text-xs">{item.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {pieTotal > 0 ? ((item.value / pieTotal) * 100).toFixed(1) : "0.0"}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tap data available
              </p>
            )}
          </div>

          {/* Column 2: Taps by Event */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-foreground">Taps by Event</h3>
              <p className="text-sm text-muted-foreground mt-1">Aggregated taps by event</p>
            </div>
            {summaryLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : tapsByEventData.length > 0 ? (
              <ChartContainer config={engagementBarConfig} className="h-56 w-full">
                <BarChart data={tapsByEventData}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `${Number(value).toLocaleString()} taps`}
                      />
                    }
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {tapsByEventData.map((item, i) => (
                      <Cell
                        key={i}
                        fill={eventColorMap.get(item.eventId) ?? PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tap data available
              </p>
            )}
          </div>

          {/* Column 3: Registration Growth */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-foreground">Registration Growth</h3>
              <p className="text-sm text-muted-foreground mt-1">First tap per band over time</p>
            </div>
            {registrationLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : registrationWide.length > 0 ? (
              <ChartContainer config={registrationConfig} className="h-56 w-full">
                <LineChart data={registrationWide}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {eventNames.map((ev) => (
                    <Line
                      key={ev.id}
                      type="monotone"
                      dataKey={ev.id}
                      name={ev.name}
                      stroke={eventColorMap.get(ev.id) ?? "#FF6B35"}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No registration data available
              </p>
            )}
          </div>
        </div>

        {/* Unique Taps — 1/4 summary + 3/4 stacked area chart */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-6">
          {/* Left: Unique Taps summary card */}
          <div className="lg:col-span-1 bg-card border border-border rounded-lg p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-primary/15 rounded-md">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Unique Taps</h3>
            </div>
            {overviewLoading ? (
              <Skeleton className="h-7 w-20" />
            ) : (
              <p className="text-3xl font-bold text-foreground">
                {(overviewSummary?.uniqueBands ?? 0).toLocaleString()}
              </p>
            )}
            <div className="flex-1 mt-1">
              {uniqueTapsAggregates.dailyTotals.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={uniqueTapsAggregates.dailyTotals}>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]!.payload as { date: string; total: number };
                        return (
                          <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                            <p className="font-medium">{d.date}</p>
                            <p className="text-muted-foreground">{d.total.toLocaleString()} unique taps</p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#FF6B35"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#FF6B35", strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[100px] flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">No data yet</span>
                </div>
              )}
            </div>
            {uniqueTapsAggregates.peakDay && (
              <div className="mt-3 pt-3 border-t border-border flex items-baseline justify-between">
                <span className="text-[10px] text-muted-foreground">Peak Day</span>
                <span className="text-xs font-medium text-foreground">
                  {uniqueTapsAggregates.peakDay.date} &middot; {uniqueTapsAggregates.peakDay.total.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Right: Unique Taps Timeline line chart */}
          <div className="lg:col-span-3 bg-card border border-border rounded-lg p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-foreground">Unique Taps Timeline</h3>
              <p className="text-sm text-muted-foreground mt-1">Daily unique band activations by event</p>
            </div>
            {uniqueTapsLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : uniqueTapsWide.length > 0 ? (
              <>
                <ChartContainer config={uniqueTapsConfig} className="h-72 w-full">
                  <LineChart data={uniqueTapsWide}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {eventNames.map((ev) => (
                      <Line
                        key={ev.id}
                        type="monotone"
                        dataKey={ev.id}
                        name={ev.name}
                        stroke={eventColorMap.get(ev.id) ?? "#FF6B35"}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
                {eventNames.length > 0 && (
                  <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border">
                    {eventNames.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: eventColorMap.get(ev.id) ?? "#FF6B35" }}
                        />
                        {ev.name}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tap data available
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
