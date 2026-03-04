"use client";

import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@sparkmotion/ui/chart";
import { Skeleton } from "@sparkmotion/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@sparkmotion/ui/popover";
import { Button } from "@sparkmotion/ui/button";
import { Checkbox } from "@sparkmotion/ui/checkbox";
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
  Users,
  MousePointerClick,
  Activity,
  TrendingUp,
  ChevronDown,
} from "lucide-react";
import { ExportAnalyticsButton } from "@/components/analytics/export-analytics-button";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

/** Random HSL color — different on each page load */
function getRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 55%)`;
}

interface CampaignAnalyticsProps {
  campaignId: string;
  campaignName: string;
  orgName: string;
  eventNames: Array<{ id: string; name: string }>;
}

export function CampaignAnalytics({ campaignId, campaignName, orgName, eventNames }: CampaignAnalyticsProps) {
  const captureRef = useRef<HTMLDivElement>(null);

  // Random color map: stable within session, randomized on refresh
  const colorMapRef = useRef(new Map<string, string>());
  const eventColorMap = useMemo(() => {
    for (const ev of eventNames) {
      if (!colorMapRef.current.has(ev.id)) {
        colorMapRef.current.set(ev.id, getRandomColor());
      }
    }
    return colorMapRef.current;
  }, [eventNames]);

  // Multi-select event filter — "all" means no event filter applied
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(["all"]);

  const handleEventSelect = (id: string) => {
    if (id === "all") {
      setSelectedEventIds(["all"]);
      return;
    }
    setSelectedEventIds((prev) => {
      const without = prev.filter((x) => x !== "all");
      if (prev.includes(id)) {
        const next = without.filter((x) => x !== id);
        return next.length === 0 ? ["all"] : next;
      }
      return [...without, id];
    });
  };

  // Derive filter params
  const activeEventIds = selectedEventIds.includes("all") ? [] : selectedEventIds;
  const singleEventId = activeEventIds.length === 1 ? activeEventIds[0] : undefined;

  const filterParams = {
    campaignId,
    eventId: singleEventId,
  };

  // tRPC queries
  const { data: engagement, isLoading: engagementLoading } =
    trpc.analytics.campaignEngagementByHour.useQuery(filterParams);
  const { data: summary, isLoading: summaryLoading } =
    trpc.analytics.campaignSummary.useQuery(filterParams);
  const { data: overviewSummary, isLoading: overviewLoading } =
    trpc.analytics.campaignSummary.useQuery({ campaignId });
  const { data: registrationData, isLoading: registrationLoading } =
    trpc.analytics.campaignRegistrationGrowth.useQuery(filterParams);

  // Tap Distribution pie: single event = window-level; all/multi = event-level
  const { data: windowTaps, isLoading: windowTapsLoading } =
    trpc.analytics.tapsByWindow.useQuery(
      { eventId: singleEventId! },
      { enabled: !!singleEventId }
    );

  // Sparkline: always full campaign history, no filters
  const { data: sparklineRaw } =
    trpc.analytics.campaignEngagementByHour.useQuery({ campaignId });

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
    ])
  ) satisfies ChartConfig;

  // Aggregate sparkline data: sum interactions across events per date
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

  // Derived KPI values (from unfiltered overview)
  const engagementRate =
    overviewSummary && overviewSummary.bandCount > 0
      ? `${(overviewSummary.tapCount / overviewSummary.bandCount).toFixed(1)}x`
      : "0.0x";

  const bandsTappedPct =
    overviewSummary && overviewSummary.bandCount > 0
      ? Math.round((overviewSummary.uniqueBands / overviewSummary.bandCount) * 100)
      : 0;

  const activationPct =
    overviewSummary && overviewSummary.bandCount > 0
      ? Math.round((overviewSummary.uniqueBands / overviewSummary.bandCount) * 100)
      : 0;

  // Sparkline peak
  const peak = sparklineData?.reduce(
    (max, d) => (d.interactions > (max?.interactions ?? 0) ? d : max),
    undefined as (typeof sparklineData)[number] | undefined
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
    : (summary?.breakdown ?? []).map((e) => ({ name: e.name, value: e.tapCount, eventId: e.eventId }));
  const pieTotal = pieSource.reduce((s, d) => s + d.value, 0);
  const pieLoading = singleEventId ? windowTapsLoading : summaryLoading;

  // Taps by Event bar data — derived from summary breakdown
  const tapsByEventData = (summary?.breakdown ?? []).map((e) => ({
    name: e.name,
    count: e.tapCount,
    eventId: e.eventId,
  }));
  const tapsByEventTotal = tapsByEventData.reduce((s, d) => s + d.count, 0);

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
    ])
  ) satisfies ChartConfig;

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
            engagement={engagement}
            windowTaps={windowTaps?.map((w) => ({ name: w.title || w.windowType, count: w.count }))}
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
              <h3 className="text-base font-semibold text-foreground">Engagement Overview</h3>
              <p className="text-xs text-muted-foreground">Campaign-wide engagement metrics</p>
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
                <span className="text-[10px] text-muted-foreground">Across all events</span>
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
                <span className="text-[10px] text-muted-foreground">All interactions</span>
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
                <span className="text-[10px] text-muted-foreground">Of total bands</span>
              </div>

              {/* Cell 4: Engagement Rate as Nx multiplier */}
              <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Engagement Rate
                  </span>
                </div>
                <p className="text-xl font-bold text-foreground">{engagementRate}</p>
                <span className="text-[10px] text-muted-foreground">Avg taps per band</span>
              </div>
            </div>
          )}

          {/* Band Activation Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">Band Activation Progress</span>
              <span className="text-xs font-medium text-foreground">
                {(overviewSummary?.uniqueBands ?? 0).toLocaleString()} / {(overviewSummary?.bandCount ?? 0).toLocaleString()} bands tapped
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${activationPct}%`, background: "linear-gradient(90deg, #FF6B35 0%, #CC4A1A 100%)" }}
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
              <h3 className="text-sm font-semibold text-foreground">Tap Activity</h3>
              <p className="text-[10px] text-muted-foreground">Campaign trend</p>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            {sparklineData && sparklineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={sparklineData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]!.payload;
                      return (
                        <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                          <p className="font-medium">{d.date}</p>
                          <p className="text-muted-foreground">{d.interactions.toLocaleString()} taps</p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="interactions"
                    stroke="#FF6B35"
                    strokeWidth={1.5}
                    dot={{ r: 3, fill: "#FF6B35", strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-24 flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground">No data</span>
              </div>
            )}
          </div>

          {/* Peak month footer — single row */}
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
              <Button variant="outline" className="gap-2">
                {selectionText}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                <Checkbox
                  checked={selectedEventIds.includes("all")}
                  onCheckedChange={() => handleEventSelect("all")}
                />
                <span className="text-sm">All Events</span>
              </label>
              {eventNames.length > 0 && (
                <div className="my-1 border-t border-border" />
              )}
              {eventNames.map((ev) => (
                <label key={ev.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                  <Checkbox
                    checked={selectedEventIds.includes(ev.id)}
                    onCheckedChange={() => handleEventSelect(ev.id)}
                  />
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: eventColorMap.get(ev.id) }}
                  />
                  <span className="text-sm truncate">{ev.name}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>

      {/* Full-width Campaign Engagement BarChart */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground">Campaign Engagement</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Interactions across all campaign events
          </p>
        </div>
        {engagementLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
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
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
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
        )}
      </div>

      {/* 3-column bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Taps by Event */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-foreground">Taps by Event</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {tapsByEventTotal.toLocaleString()} total taps
            </p>
          </div>
          {summaryLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : tapsByEventData.length > 0 ? (
            <ChartContainer config={{}} className="h-64 w-full">
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
                  {tapsByEventData.map((item) => (
                    <Cell key={item.eventId} fill={eventColorMap.get(item.eventId) ?? "#FF6B35"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No event data available
            </p>
          )}
        </div>

        {/* Column 2: Tap Distribution — donut with manual legend */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-foreground">Tap Distribution</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {singleEventId ? "By redirect window" : "By event"}
            </p>
          </div>
          {pieLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : pieSource.length > 0 && pieTotal > 0 ? (
            <>
              <ChartContainer config={{}} className="h-44 w-full">
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
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieSource.map((item, i) => (
                      <Cell
                        key={i}
                        fill={item.eventId ? (eventColorMap.get(item.eventId) ?? PIE_COLORS[i % PIE_COLORS.length]) : PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              {/* Manual legend rows */}
              <div className="mt-3 space-y-1.5">
                {pieSource.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: item.eventId ? (eventColorMap.get(item.eventId) ?? PIE_COLORS[i % PIE_COLORS.length]) : PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-muted-foreground truncate">{item.name}</span>
                    </div>
                    <span className="font-medium text-foreground ml-2">
                      {pieTotal > 0 ? Math.round((item.value / pieTotal) * 100) : 0}%
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

        {/* Column 3: Registration Growth */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-foreground">Registration Growth</h3>
            <p className="text-sm text-muted-foreground mt-1">First tap per band over time</p>
          </div>
          {registrationLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : registrationWide.length > 0 ? (
            <ChartContainer config={registrationConfig} className="h-64 w-full">
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
      </section>
    </div>
  );
}
