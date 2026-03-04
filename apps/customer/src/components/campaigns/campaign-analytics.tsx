"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
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
import { cn } from "@sparkmotion/ui";
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
} from "recharts";
import {
  Users,
  MousePointerClick,
  Activity,
  TrendingUp,
  ChevronDown,
  X,
} from "lucide-react";
import { ExportAnalyticsButton } from "@/components/analytics/export-analytics-button";

const engagementConfig = {
  interactions: {
    label: "Interactions",
    color: "#FF6B35",
  },
} satisfies ChartConfig;

const registrationConfig = {
  count: {
    label: "Registrations",
    color: "#FF6B35",
  },
} satisfies ChartConfig;

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const REDIRECT_COLORS: Record<string, string> = {
  PRE: "hsl(var(--chart-1))",
  LIVE: "hsl(var(--chart-2))",
  POST: "hsl(var(--chart-3))",
  FALLBACK: "hsl(215 20% 65%)",
  ORG: "hsl(215 15% 55%)",
  DEFAULT: "hsl(215 10% 45%)",
};

const windowTypeTapsConfig = {
  count: {
    label: "Taps",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

interface CampaignAnalyticsProps {
  campaignId: string;
  campaignName: string;
  orgName: string;
  eventNames: Array<{ id: string; name: string }>;
}

export function CampaignAnalytics({ campaignId, campaignName, orgName, eventNames }: CampaignAnalyticsProps) {
  const captureRef = useRef<HTMLDivElement>(null);

  // Multi-select event filter — "all" means no event filter applied
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(["all"]);
  // Inline datetime pickers
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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

  const derivedFrom = customFrom || undefined;
  const derivedTo = customTo || undefined;

  const filterParams = {
    campaignId,
    eventId: singleEventId,
    ...(derivedFrom && derivedTo ? { from: derivedFrom, to: derivedTo } : {}),
  };

  // tRPC queries
  const { data: engagement, isLoading: engagementLoading } =
    trpc.analytics.campaignEngagementByHour.useQuery(filterParams);
  const { data: summary, isLoading: summaryLoading } =
    trpc.analytics.campaignSummary.useQuery(filterParams);
  const { data: redirectTypeData, isLoading: redirectTypeLoading } =
    trpc.analytics.campaignTapsByRedirectType.useQuery({
      campaignId,
      eventId: singleEventId,
      from: filterParams.from,
      to: filterParams.to,
    });
  const { data: registrationData, isLoading: registrationLoading } =
    trpc.analytics.campaignRegistrationGrowth.useQuery(filterParams);

  // Tap Distribution pie: single event = window-level; all/multi = event-level
  const { data: windowTaps, isLoading: windowTapsLoading } =
    trpc.analytics.tapsByWindow.useQuery(
      { eventId: singleEventId!, from: filterParams.from, to: filterParams.to },
      { enabled: !!singleEventId }
    );

  // Sparkline: always full campaign history, no filters
  const { data: sparklineData } =
    trpc.analytics.campaignEngagementByHour.useQuery({ campaignId });

  // Derived KPI values
  const engagementRate =
    summary && summary.bandCount > 0
      ? `${(summary.tapCount / summary.bandCount).toFixed(1)}x`
      : "0.0x";

  const bandsTappedPct =
    summary && summary.bandCount > 0
      ? Math.round((summary.uniqueBands / summary.bandCount) * 100)
      : 0;

  const activationPct =
    summary && summary.bandCount > 0
      ? Math.round((summary.uniqueBands / summary.bandCount) * 100)
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

  const hasCustomTime = !!customFrom && !!customTo;

  const clearCustomTime = () => {
    setCustomFrom("");
    setCustomTo("");
  };

  // Pie chart data
  const pieSource = singleEventId
    ? (windowTaps ?? []).map((w) => ({
        name: `${w.windowType} - ${w.title || "Untitled"}`,
        value: w.count,
      }))
    : (summary?.breakdown ?? []).map((e) => ({ name: e.name, value: e.tapCount }));
  const pieTotal = pieSource.reduce((s, d) => s + d.value, 0);
  const pieLoading = singleEventId ? windowTapsLoading : summaryLoading;

  // Bar chart data
  const barChartData = (redirectTypeData ?? []).map((item) => ({
    type: item.category,
    count: item.count,
  }));

  // Filter subtitle
  const filterLabel = selectedEventIds.includes("all")
    ? "All Events"
    : activeEventIds.length === 1
    ? eventNames.find((e) => e.id === activeEventIds[0])?.name ?? "Selected Event"
    : `${activeEventIds.length} events`;

  return (
    <div className="space-y-6" ref={captureRef}>
      {/* Section 1: Top row — 3/4 Engagement Overview + 1/4 Tap Activity sparkline */}
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
          {summaryLoading ? (
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
                  {(summary?.bandCount ?? 0).toLocaleString()}
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
                  {(summary?.tapCount ?? 0).toLocaleString()}
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
                    {(summary?.uniqueBands ?? 0).toLocaleString()}
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
                {(summary?.uniqueBands ?? 0).toLocaleString()} / {(summary?.bandCount ?? 0).toLocaleString()} bands tapped
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${activationPct}%` }}
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
              <div className="h-24 flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground">No data</span>
              </div>
            )}
          </div>

          {/* Peak month footer */}
          {peak && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground">Peak Month</p>
              <p className="text-xs font-medium text-foreground">{peak.date}</p>
              <p className="text-[10px] text-muted-foreground">
                {peak.interactions.toLocaleString()} interactions
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Detailed Analytics */}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Multi-select checkbox dropdown for events */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              {selectionText}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            {/* All Events option */}
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
            {eventNames.map((ev, i) => (
              <label key={ev.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                <Checkbox
                  checked={selectedEventIds.includes(ev.id)}
                  onCheckedChange={() => handleEventSelect(ev.id)}
                />
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="text-sm truncate">{ev.name}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        {/* Inline datetime pickers */}
        <span className="text-xs text-muted-foreground">Or Custom Time</span>
        <input
          type="datetime-local"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className={cn(
            "h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
        />
        <input
          type="datetime-local"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className={cn(
            "h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          )}
        />
        {hasCustomTime && (
          <Button variant="ghost" size="sm" onClick={clearCustomTime}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        )}

        <div className="ml-auto">
          <ExportAnalyticsButton
            entityName={campaignName}
            orgName={orgName}
            summary={summary}
            engagement={engagement}
            windowTaps={windowTaps?.map((w) => ({ name: w.title || w.windowType, count: w.count }))}
            captureRef={captureRef}
          />
        </div>
      </div>

      {/* Full-width Campaign Engagement BarChart */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground">Campaign Engagement</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Daily interaction trend — {filterLabel}
          </p>
        </div>
        {engagementLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ChartContainer config={engagementConfig} className="h-72 w-full">
            <BarChart data={engagement ?? []}>
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
              <Bar dataKey="interactions" fill="#FF6B35" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </div>

      {/* 3-column bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Taps by Redirect Type */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-foreground">Taps by Redirect Type</h3>
            <p className="text-sm text-muted-foreground mt-1">Aggregated by redirect type</p>
          </div>
          {redirectTypeLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : barChartData.length > 0 ? (
            <ChartContainer config={windowTypeTapsConfig} className="h-64 w-full">
              <BarChart data={barChartData}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="type"
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
                  {barChartData.map((item, i) => (
                    <Cell key={i} fill={REDIRECT_COLORS[item.type] ?? "hsl(var(--muted-foreground))"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No redirect data available
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
                    {pieSource.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
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
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
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
          ) : registrationData && registrationData.length > 0 ? (
            <ChartContainer config={registrationConfig} className="h-64 w-full">
              <LineChart data={registrationData}>
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
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#FF6B35"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No registration data available
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
