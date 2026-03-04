"use client";

import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@sparkmotion/ui/chart";
import { Skeleton } from "@sparkmotion/ui/skeleton";
import { Calendar } from "@sparkmotion/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@sparkmotion/ui/popover";
import { Button } from "@sparkmotion/ui/button";
import { Checkbox } from "@sparkmotion/ui/checkbox";
import { Badge } from "@sparkmotion/ui/badge";
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
  Tooltip,
} from "recharts";
import { Users, MousePointerClick, Activity, TrendingUp, ChevronDown, CalendarIcon, X } from "lucide-react";
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
  // Vibrant — window types
  PRE: "hsl(var(--chart-1))",
  LIVE: "hsl(var(--chart-2))",
  POST: "hsl(var(--chart-3))",
  // Muted — non-window redirect types
  FALLBACK: "hsl(215 20% 65%)",
  ORG: "hsl(215 15% 55%)",
  DEFAULT: "hsl(215 10% 45%)",
};

/** Random HSL color — different on each page load */
function getRandomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 55%)`;
}

const windowTypeTapsConfig = {
  count: {
    label: "Taps",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

interface EventsAnalyticsProps {
  eventId: string;
  eventName: string;
  orgName: string;
}

export function EventsAnalytics({ eventId, eventName, orgName }: EventsAnalyticsProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [selectedWindowIds, setSelectedWindowIds] = useState<string[]>(["all"]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [windowDropdownOpen, setWindowDropdownOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: windows } =
    trpc.windows.list.useQuery({ eventId });

  // Random color map for windows: stable within session, randomized on refresh
  const colorMapRef = useRef(new Map<string, string>());
  const windowColorMap = useMemo(() => {
    for (const w of windows ?? []) {
      if (!colorMapRef.current.has(w.id)) {
        colorMapRef.current.set(w.id, getRandomColor());
      }
    }
    // Static grey colors for non-window categories
    colorMapRef.current.set("__FALLBACK__", REDIRECT_COLORS.FALLBACK);
    colorMapRef.current.set("__ORG__", REDIRECT_COLORS.ORG);
    colorMapRef.current.set("__DEFAULT__", REDIRECT_COLORS.DEFAULT);
    return colorMapRef.current;
  }, [windows]);

  // Multi-select handler
  const handleWindowSelect = (id: string) => {
    if (id === "all") {
      setSelectedWindowIds(["all"]);
      return;
    }
    setSelectedWindowIds((prev) => {
      const without = prev.filter((x) => x !== "all");
      if (prev.includes(id)) {
        const next = without.filter((x) => x !== id);
        return next.length === 0 ? ["all"] : next;
      }
      return [...without, id];
    });
  };

  // Derive filter params
  const activeWindowIds = selectedWindowIds.includes("all") ? [] : selectedWindowIds;
  const singleWindowId = activeWindowIds.length === 1 ? activeWindowIds[0] : undefined;

  const derivedFrom =
    customFrom ||
    (dateRange?.from ? format(dateRange.from, "yyyy-MM-dd'T'00:00:00.000'Z'") : undefined);
  const derivedTo =
    customTo ||
    (dateRange?.to ? format(dateRange.to, "yyyy-MM-dd'T'23:59:59.999'Z'") : undefined);

  const filterParams = {
    eventId,
    windowId: singleWindowId,
    ...(derivedFrom && derivedTo ? { from: derivedFrom, to: derivedTo } : {}),
  };

  const { data: engagement, isLoading: engagementLoading } =
    trpc.analytics.engagementByHour.useQuery(filterParams);
  const { data: summary } =
    trpc.analytics.eventSummary.useQuery(filterParams);
  const { data: overviewSummary, isLoading: overviewLoading } =
    trpc.analytics.eventSummary.useQuery({ eventId });
  const { data: redirectTypeData, isLoading: redirectTypeLoading } =
    trpc.analytics.tapsByRedirectType.useQuery({ eventId, from: filterParams.from, to: filterParams.to });
  const { data: windowTaps, isLoading: windowTapsLoading } =
    trpc.analytics.tapsByWindow.useQuery({ eventId, from: filterParams.from, to: filterParams.to });
  const { data: registrationData, isLoading: registrationLoading } =
    trpc.analytics.registrationGrowth.useQuery(filterParams);

  // By-window queries — only when NOT filtering to a single window
  const byWindowParams = { eventId, ...(derivedFrom && derivedTo ? { from: derivedFrom, to: derivedTo } : {}) };
  const showByWindow = !singleWindowId;
  const { data: engagementByWindow, isLoading: engagementByWindowLoading } =
    trpc.analytics.engagementByWindow.useQuery(byWindowParams, { enabled: showByWindow });
  const { data: registrationByWindow, isLoading: registrationByWindowLoading } =
    trpc.analytics.registrationGrowthByWindow.useQuery(byWindowParams, { enabled: showByWindow });

  // Pivot engagement-by-window into wide format: { date, [windowId]: count }
  const engagementWide = useMemo(() => {
    if (!engagementByWindow || engagementByWindow.length === 0) return [];
    const byDate = new Map<string, Record<string, number>>();
    for (const row of engagementByWindow) {
      if (!byDate.has(row.date)) byDate.set(row.date, {});
      byDate.get(row.date)![row.windowId] = row.interactions;
    }
    return Array.from(byDate.entries()).map(([date, counts]) => ({ date, ...counts }));
  }, [engagementByWindow]);

  // Unique window list from by-window data
  const windowList = useMemo(() => {
    if (!engagementByWindow) return [];
    const seen = new Map<string, string>();
    for (const row of engagementByWindow) {
      if (!seen.has(row.windowId)) seen.set(row.windowId, row.windowLabel);
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [engagementByWindow]);

  // Dynamic chart configs for by-window charts
  const engagementByWindowConfig = Object.fromEntries(
    windowList.map((w) => [
      w.id,
      { label: w.label, color: windowColorMap.get(w.id) ?? "#FF6B35" },
    ])
  ) satisfies ChartConfig;

  // Pivot registration-by-window into wide format
  const registrationWide = useMemo(() => {
    if (!registrationByWindow || registrationByWindow.length === 0) return [];
    const byDate = new Map<string, Record<string, number>>();
    for (const row of registrationByWindow) {
      if (!byDate.has(row.date)) byDate.set(row.date, {});
      byDate.get(row.date)![row.windowId] = row.count;
    }
    return Array.from(byDate.entries()).map(([date, counts]) => ({ date, ...counts }));
  }, [registrationByWindow]);

  const registrationByWindowConfig = Object.fromEntries(
    windowList.map((w) => [
      w.id,
      { label: w.label, color: windowColorMap.get(w.id) ?? "#FF6B35" },
    ])
  ) satisfies ChartConfig;

  // Sparkline: always full event history, no filters
  const { data: sparklineData } =
    trpc.analytics.engagementByHour.useQuery({ eventId });

  // Derived KPI values (from unfiltered overview)
  const avgTapsPerBand =
    overviewSummary && overviewSummary.bandCount > 0
      ? (overviewSummary.tapCount / overviewSummary.bandCount).toFixed(1)
      : "0.0";
  const engagementPct = overviewSummary?.engagementPercent?.toFixed(1) ?? "0.0";
  const bandsTappedSubtitle = overviewSummary
    ? `${overviewSummary.uniqueBands.toLocaleString()} of ${overviewSummary.bandCount.toLocaleString()} bands`
    : "";
  const activationPct =
    overviewSummary && overviewSummary.bandCount > 0
      ? Math.round((overviewSummary.uniqueBands / overviewSummary.bandCount) * 100)
      : 0;

  // Sparkline peak calculation
  const peak = sparklineData?.reduce(
    (max, d) => (d.interactions > (max?.interactions ?? 0) ? d : max),
    undefined as (typeof sparklineData)[number] | undefined
  );

  // Build filter subtitle
  const filterSubtitle =
    derivedFrom && derivedTo
      ? `${customFrom ? customFrom.slice(0, 10) : format(dateRange!.from!, "MMM d")} - ${customTo ? customTo.slice(0, 10) : format(dateRange!.to!, "MMM d, yyyy")}`
      : selectedWindowIds.includes("all")
        ? "All time interaction data"
        : activeWindowIds.length === 1
          ? `Window: ${windows?.find((w) => w.id === activeWindowIds[0])?.title ?? activeWindowIds[0]}`
          : `${activeWindowIds.length} windows selected`;

  // Dropdown selection label
  const selectionText = selectedWindowIds.includes("all")
    ? "All Time"
    : activeWindowIds.length === 1
      ? windows?.find((w) => w.id === activeWindowIds[0])?.title ?? "1 window"
      : `${activeWindowIds.length} windows`;

  // Bar chart data
  const barData = (redirectTypeData ?? []).map((item) => ({
    type: item.category,
    count: item.count,
  }));

  // Pie chart data — use windowColorMap for consistent colors across all charts
  const NON_WINDOW_CATEGORIES = ["FALLBACK", "ORG", "DEFAULT"];
  const filteredWindowTaps = singleWindowId
    ? (windowTaps ?? []).filter((w) => w.windowId === singleWindowId)
    : (windowTaps ?? []);
  const windowSlices = filteredWindowTaps.map((w) => ({
    name: `${w.windowType} - ${w.title || "Untitled"}`,
    value: w.count,
    colorKey: w.windowId,
  }));
  const nonWindowSlices = !singleWindowId
    ? (redirectTypeData ?? [])
        .filter((item) => NON_WINDOW_CATEGORIES.includes(item.category) && item.count > 0)
        .map((item) => ({ name: item.category, value: item.count, colorKey: `__${item.category}__` }))
    : [];
  const pieSlices = [...windowSlices, ...nonWindowSlices];
  const pieTotal = pieSlices.reduce((s, d) => s + d.value, 0);
  const pieConfig = pieSlices.reduce<ChartConfig>((acc, item, i) => {
    const color = windowColorMap.get(item.colorKey) ?? PIE_COLORS[i % PIE_COLORS.length];
    acc[item.name] = { label: item.name, color };
    return acc;
  }, {});

  const hasCustomFilters = !selectedWindowIds.includes("all") || !!dateRange || !!customFrom || !!customTo;

  const clearFilters = () => {
    setSelectedWindowIds(["all"]);
    setDateRange(undefined);
    setCustomFrom("");
    setCustomTo("");
  };

  return (
    <div className="space-y-8" ref={captureRef}>

      {/* ── ANALYTICS OVERVIEW ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Analytics Overview</h2>
          <ExportAnalyticsButton
            entityName={eventName}
            orgName={orgName}
            summary={summary}
            engagement={engagement}
            windowTaps={windowTaps?.map((w) => ({ name: w.title || w.windowType, count: w.count }))}
            captureRef={captureRef}
          />
        </div>

      {/* Top row — Engagement Overview (3/4) + Tap Activity sparkline (1/4) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Engagement Overview card */}
        <div className="lg:col-span-3 bg-card border border-border rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-primary/15 rounded-md">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Engagement Overview</h3>
          </div>

          {/* 5-cell KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Total Bands */}
            <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Total Bands
                </span>
              </div>
              {overviewLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <p className="text-xl font-bold text-foreground">
                  {overviewSummary?.bandCount.toLocaleString() ?? "0"}
                </p>
              )}
              <span className="text-[10px] text-muted-foreground">Registered to event</span>
            </div>

            {/* Total Taps */}
            <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <MousePointerClick className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Total Taps
                </span>
              </div>
              {overviewLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <p className="text-xl font-bold text-foreground">
                  {overviewSummary?.tapCount.toLocaleString() ?? "0"}
                </p>
              )}
              <span className="text-[10px] text-muted-foreground">All interactions</span>
            </div>

            {/* Bands Tapped */}
            <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Bands Tapped
                </span>
              </div>
              {overviewLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <p className="text-xl font-bold text-foreground">
                  {overviewSummary?.uniqueBands.toLocaleString() ?? "0"}
                </p>
              )}
              <span className="text-[10px] text-muted-foreground">Of total bands</span>
            </div>

            {/* Engagement % */}
            <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Engagement
                </span>
              </div>
              {overviewLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <p className="text-xl font-bold text-foreground">{engagementPct}%</p>
              )}
              <span className="text-[10px] text-muted-foreground">{bandsTappedSubtitle}</span>
            </div>

            {/* Avg Taps/Band */}
            <div className="bg-muted/30 rounded-lg p-2.5 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Avg Taps/Band
                </span>
              </div>
              {overviewLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <p className="text-xl font-bold text-foreground">{avgTapsPerBand}</p>
              )}
              <span className="text-[10px] text-muted-foreground">Per registered band</span>
            </div>
          </div>

          {/* Band Activation Progress bar */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">Band Activation Progress</span>
              <span className="text-[11px] font-semibold text-foreground">
                {overviewSummary?.uniqueBands.toLocaleString() ?? "0"} / {overviewSummary?.bandCount.toLocaleString() ?? "0"} bands tapped
              </span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${activationPct}%` }} />
            </div>
          </div>
        </div>

        {/* Tap Activity sparkline card */}
        <div className="lg:col-span-1 bg-card border border-border rounded-lg p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-primary/15 rounded-md">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Tap Activity</h3>
          </div>
          <div className="flex-1 min-h-[100px]">
            {sparklineData && sparklineData.length > 0 ? (
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={sparklineData}>
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
          <Popover open={windowDropdownOpen} onOpenChange={setWindowDropdownOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start text-left font-normal min-w-[160px]">
                <span className="flex-1 truncate">{selectionText}</span>
                <ChevronDown className="ml-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50"
                onClick={() => handleWindowSelect("all")}
              >
                <Checkbox
                  id="window-all"
                  checked={selectedWindowIds.includes("all")}
                  onCheckedChange={() => handleWindowSelect("all")}
                />
                <label htmlFor="window-all" className="text-sm cursor-pointer flex-1">All Time</label>
              </div>
              {windows && windows.length > 0 && (
                <>
                  <div className="my-1.5 border-t border-border" />
                  {windows.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/50"
                      onClick={() => handleWindowSelect(w.id)}
                    >
                      <Checkbox
                        id={`window-${w.id}`}
                        checked={selectedWindowIds.includes(w.id)}
                        onCheckedChange={() => handleWindowSelect(w.id)}
                      />
                      <label htmlFor={`window-${w.id}`} className="text-sm cursor-pointer flex-1 truncate">
                        {w.title || w.windowType}
                      </label>
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                        {w.windowType}
                      </Badge>
                    </div>
                  ))}
                </>
              )}
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground">Or Custom Time</span>
          <input
            type="datetime-local"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground h-9"
          />
          <input
            type="datetime-local"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground h-9"
          />
          {hasCustomFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

      {/* Full-width engagement BarChart */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground">Event Engagement</h3>
          <p className="text-sm text-muted-foreground mt-1">{filterSubtitle}</p>
        </div>
        {(showByWindow ? engagementByWindowLoading : engagementLoading) ? (
          <Skeleton className="h-72 w-full" />
        ) : showByWindow && engagementWide.length > 0 ? (
          <ChartContainer config={engagementByWindowConfig} className="h-72 w-full">
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
              {windowList.map((w) => (
                <Bar
                  key={w.id}
                  dataKey={w.id}
                  name={w.label}
                  fill={windowColorMap.get(w.id) ?? "#FF6B35"}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ChartContainer>
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
            <h3 className="text-lg font-semibold text-foreground">Taps by Redirect Type</h3>
            <p className="text-sm text-muted-foreground mt-1">Aggregated by redirect type</p>
          </div>
          {redirectTypeLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : barData.length > 0 ? (
            <ChartContainer config={windowTypeTapsConfig} className="h-56 w-full">
              <BarChart data={barData}>
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
                  {barData.map((item, i) => (
                    <Cell key={i} fill={REDIRECT_COLORS[item.type] ?? "hsl(var(--muted-foreground))"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No redirect type data available
            </p>
          )}
        </div>

        {/* Column 2: Tap Distribution (donut + manual legend) */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">Tap Distribution</h3>
            <p className="text-sm text-muted-foreground mt-1">Tap distribution across redirect destinations</p>
          </div>
          {windowTapsLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : pieSlices.length > 0 && pieTotal > 0 ? (
            <>
              <ChartContainer config={pieConfig} className="h-40 w-full">
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `${Number(value).toLocaleString()} taps`}
                      />
                    }
                  />
                  <Pie
                    data={pieSlices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {pieSlices.map((item, i) => (
                      <Cell key={i} fill={windowColorMap.get(item.colorKey) ?? PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              {/* Manual legend below chart */}
              <div className="space-y-2 mt-2">
                {pieSlices.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: windowColorMap.get(item.colorKey) ?? PIE_COLORS[i % PIE_COLORS.length] }}
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
              No window data available
            </p>
          )}
        </div>

        {/* Column 3: Registration Growth */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">Registration Growth</h3>
            <p className="text-sm text-muted-foreground mt-1">First tap per band over time</p>
          </div>
          {(showByWindow ? registrationByWindowLoading : registrationLoading) ? (
            <Skeleton className="h-56 w-full" />
          ) : showByWindow && registrationWide.length > 0 ? (
            <ChartContainer config={registrationByWindowConfig} className="h-56 w-full">
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
                {windowList.map((w) => (
                  <Line
                    key={w.id}
                    type="monotone"
                    dataKey={w.id}
                    name={w.label}
                    stroke={windowColorMap.get(w.id) ?? "#FF6B35"}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          ) : registrationData && registrationData.length > 0 ? (
            <ChartContainer config={registrationConfig} className="h-56 w-full">
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
      </section>
    </div>
  );
}
