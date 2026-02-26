"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
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
} from "recharts";
import { Users, MousePointerClick, Activity, CalendarIcon, X } from "lucide-react";
import { ExportAnalyticsButton } from "@/components/analytics/export-analytics-button";

const engagementConfig = {
  interactions: {
    label: "Interactions",
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
  const [selectedWindowId, setSelectedWindowId] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const { data: windows } =
    trpc.windows.list.useQuery({ eventId });

  // Build shared filter params for all analytics queries
  const filterParams = {
    eventId,
    windowId: selectedWindowId,
    ...(dateRange?.from && dateRange?.to
      ? { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }
      : {}),
  };

  const { data: engagement, isLoading: engagementLoading } =
    trpc.analytics.engagementByHour.useQuery(filterParams);
  const { data: summary, isLoading: summaryLoading } =
    trpc.analytics.eventSummary.useQuery(filterParams);
  const { data: redirectTypeData, isLoading: redirectTypeLoading } =
    trpc.analytics.tapsByRedirectType.useQuery({ eventId, from: filterParams.from, to: filterParams.to });
  const { data: windowTaps, isLoading: windowTapsLoading } =
    trpc.analytics.tapsByWindow.useQuery({ eventId, from: filterParams.from, to: filterParams.to });

  const engagementRate = summary?.engagementPercent ?? 0;

  const handleWindowChange = (value: string) => {
    setSelectedWindowId(value === "all" ? undefined : value);
  };

  const hasActiveFilters = !!selectedWindowId || !!dateRange;

  const clearFilters = () => {
    setSelectedWindowId(undefined);
    setDateRange(undefined);
  };

  // Build subtitle reflecting active filters
  const selectedWindow = windows?.find((w) => w.id === selectedWindowId);
  const filterSubtitle = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
    : selectedWindow
      ? `${format(new Date(selectedWindow.startTime!), "MMM d")} - ${format(new Date(selectedWindow.endTime!), "MMM d, yyyy")}`
      : "All time interaction data";

  // Client-side window filter (API only accepts eventId + date range, not windowId)
  const filteredWindowTaps = selectedWindowId
    ? (windowTaps ?? []).filter((w) => w.windowId === selectedWindowId)
    : (windowTaps ?? []);

  // Bar chart data: from tapsByRedirectType (includes FALLBACK/ORG/DEFAULT)
  const barData = (redirectTypeData ?? []).map((item) => ({
    type: item.category,
    count: item.count,
  }));

  // Pie chart data: one slice per window, label = "TYPE - Title"
  const pieSlices = filteredWindowTaps.map((w) => ({
    name: `${w.windowType} - ${w.title || "Untitled"}`,
    value: w.count,
  }));
  const pieTotal = pieSlices.reduce((s, d) => s + d.value, 0);
  const pieConfig = pieSlices.reduce<ChartConfig>((acc, item, i) => {
    acc[item.name] = { label: item.name, color: PIE_COLORS[i % PIE_COLORS.length] };
    return acc;
  }, {});

  const isRedirectFilter = selectedWindowId?.startsWith("__");

  return (
    <div className="space-y-6" ref={captureRef}>
      {/* Top-level filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Date range picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal",
                !dateRange && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "LLL dd, y")} -{" "}
                    {format(dateRange.to, "LLL dd, y")}
                  </>
                ) : (
                  format(dateRange.from, "LLL dd, y")
                )
              ) : (
                "Date range"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        {/* Window select */}
        <Select
          value={selectedWindowId ?? "all"}
          onValueChange={handleWindowChange}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Redirects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Redirects</SelectItem>
            <SelectItem value="__FALLBACK__">FALLBACK</SelectItem>
            <SelectItem value="__ORG__">ORG</SelectItem>
            <SelectItem value="__DEFAULT__">DEFAULT</SelectItem>
            {windows?.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.title || `${w.windowType} — ${w.url.slice(0, 30)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Clear filters
          </Button>
        )}

        <div className="ml-auto">
          <ExportAnalyticsButton
            entityName={eventName}
            orgName={orgName}
            summary={summary}
            engagement={engagement}
            windowTaps={windowTaps?.map(w => ({ name: w.title || w.windowType, count: w.count }))}
            captureRef={captureRef}
          />
        </div>
      </div>

      {/* Section 1: Event Engagement Bar Chart */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground">Event Engagement</h3>
          <p className="text-sm text-muted-foreground mt-1">{filterSubtitle}</p>
        </div>
        {engagementLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ChartContainer config={engagementConfig} className="h-72 w-full">
            <LineChart data={engagement ?? []}>
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
              <ChartTooltip
                content={<ChartTooltipContent />}
              />
              <Line
                type="monotone"
                dataKey="interactions"
                stroke="#FF6B35"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </div>

      {/* Section 2: Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Registrations"
          value={summaryLoading ? null : (summary?.bandCount ?? 0)}
          icon={<Users className="w-4 h-4 text-primary" />}
          loading={summaryLoading}
        />
        <StatCard
          title="Total Interactions"
          value={summaryLoading ? null : (summary?.tapCount ?? 0)}
          icon={<MousePointerClick className="w-4 h-4 text-primary" />}
          loading={summaryLoading}
        />
        <StatCard
          title="Engagement Rate"
          value={summaryLoading ? null : `${engagementRate}%`}
          icon={<Activity className="w-4 h-4 text-primary" />}
          loading={summaryLoading}
        />
      </div>

      {/* Section 3: Bar Chart by Redirect Type + Pie Chart by Window */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Bar chart — Taps by Redirect Type */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">Taps by Redirect Type</h3>
            <p className="text-sm text-muted-foreground mt-1">Aggregated by redirect type</p>
          </div>
          {redirectTypeLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : barData.length > 0 ? (
            <ChartContainer config={windowTypeTapsConfig} className="h-72 w-full">
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
              No window data available
            </p>
          )}
        </div>

        {/* Right: Pie chart — Tap Distribution */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">Tap Distribution</h3>
            <p className="text-sm text-muted-foreground mt-1">Tap distribution across redirect destinations</p>
          </div>
          {windowTapsLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : pieSlices.length > 0 && pieTotal > 0 ? (
            <ChartContainer config={pieConfig} className="h-72 w-full">
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
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ name, percent }) =>
                    `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`
                  }
                >
                  {pieSlices.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="name" />} />
              </PieChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isRedirectFilter ? "Non-window redirect types have no individual breakdown" : "No window data available"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  loading,
}: {
  title: string;
  value: string | number | null;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 bg-primary/10 rounded-md">{icon}</div>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="text-2xl font-bold text-foreground">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
      )}
      <p className="text-sm text-muted-foreground mt-1">{title}</p>
    </div>
  );
}
