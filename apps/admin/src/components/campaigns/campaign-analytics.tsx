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
import { Users, MousePointerClick, Activity, Megaphone, CalendarIcon, X } from "lucide-react";
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
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const [selectedWindowId, setSelectedWindowId] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Fetch windows when an event is selected
  const { data: windows } = trpc.windows.list.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );

  // Build shared filter params for all analytics queries
  const filterParams = {
    campaignId,
    eventId: selectedEventId,
    windowId: selectedWindowId,
    ...(dateRange?.from && dateRange?.to
      ? { from: dateRange.from.toISOString(), to: dateRange.to.toISOString() }
      : {}),
  };

  const { data: engagement, isLoading: engagementLoading } =
    trpc.analytics.campaignEngagementByHour.useQuery(filterParams);
  const { data: summary, isLoading: summaryLoading } =
    trpc.analytics.campaignSummary.useQuery(filterParams);
  const { data: windowTaps, isLoading: windowTapsLoading } =
    trpc.analytics.tapsByWindow.useQuery(
      { eventId: selectedEventId!, from: filterParams.from, to: filterParams.to },
      { enabled: !!selectedEventId }
    );
  const { data: windowTypeData, isLoading: windowTypeLoading } =
    trpc.analytics.tapsByWindowType.useQuery({
      campaignId,
      eventId: selectedEventId,
      from: filterParams.from,
      to: filterParams.to,
    });

  const engagementRate = summary?.aggregateEngagement ?? 0;

  // Reset window when event changes
  const handleEventChange = (value: string) => {
    setSelectedEventId(value === "all" ? undefined : value);
    setSelectedWindowId(undefined);
  };

  const handleWindowChange = (value: string) => {
    setSelectedWindowId(value === "all" ? undefined : value);
  };

  const hasActiveFilters = !!selectedEventId || !!selectedWindowId || !!dateRange;

  const clearFilters = () => {
    setSelectedEventId(undefined);
    setSelectedWindowId(undefined);
    setDateRange(undefined);
  };

  // Build subtitle reflecting active filters
  const filterLabel = selectedEventId
    ? eventNames.find((e) => e.id === selectedEventId)?.name ?? "Selected Event"
    : "All Events";
  const dateLabel = dateRange?.from && dateRange?.to
    ? ` — ${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
    : "";

  // Client-side window filter (API only accepts eventId + date range, not windowId)
  const filteredWindowTaps = selectedWindowId
    ? (windowTaps ?? []).filter((w) => w.windowId === selectedWindowId)
    : (windowTaps ?? []);

  // Bar chart data: aggregate by window type (PRE / LIVE / POST)
  const barData = (() => {
    if (!filteredWindowTaps.length) return [];
    const grouped = new Map<string, number>();
    for (const w of filteredWindowTaps) {
      grouped.set(w.windowType, (grouped.get(w.windowType) ?? 0) + w.count);
    }
    return Array.from(grouped, ([type, count]) => ({ type, count }));
  })();

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

  // Campaign-level pie: taps by event (when no event selected)
  const eventPieData = (summary?.breakdown ?? []).map((e) => ({ name: e.name, value: e.tapCount }));
  const eventPieTotal = eventPieData.reduce((s, d) => s + d.value, 0);
  const eventPieConfig = eventPieData.reduce<ChartConfig>((acc, item, i) => {
    acc[item.name] = { label: item.name, color: PIE_COLORS[i % PIE_COLORS.length] };
    return acc;
  }, {});

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

        {/* Event select */}
        <Select
          value={selectedEventId ?? "all"}
          onValueChange={handleEventChange}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            {eventNames.map((ev) => (
              <SelectItem key={ev.id} value={ev.id}>
                {ev.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Window select (only when event is selected) */}
        {selectedEventId && (
          <Select
            value={selectedWindowId ?? "all"}
            onValueChange={handleWindowChange}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All Windows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Windows</SelectItem>
              {windows?.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.title || `${w.windowType} — ${w.url.slice(0, 30)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Clear filters
          </Button>
        )}

        <div className="ml-auto">
          <ExportAnalyticsButton
            entityName={campaignName}
            orgName={orgName}
            summary={summary}
            engagement={engagement}
            windowTaps={windowTaps?.map(w => ({ name: w.title || w.windowType, count: w.count }))}
            captureRef={captureRef}
          />
        </div>
      </div>

      {/* Section 1: Campaign Engagement Bar Chart */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground">Campaign Engagement</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Daily interaction trend — {filterLabel}{dateLabel}
          </p>
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
              <ChartTooltip content={<ChartTooltipContent />} />
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
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Total Events"
          value={summaryLoading ? null : (summary?.eventCount ?? 0)}
          icon={<Megaphone className="w-4 h-4 text-primary" />}
          loading={summaryLoading}
        />
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

      {/* Section 3: Taps by Window Type (always) + right column (contextual) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Bar chart — Taps by Window Type (always visible) */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">Taps by Window Type</h3>
            <p className="text-sm text-muted-foreground mt-1">Aggregated by redirect type (PRE / LIVE / POST)</p>
          </div>
          {(() => {
            // When event is selected, use barData from filteredWindowTaps (supports window filter)
            // Otherwise, use windowTypeData from the new endpoint
            const chartData = selectedEventId ? barData : (windowTypeData ?? []);
            const isLoading = selectedEventId ? windowTapsLoading : windowTypeLoading;

            if (isLoading) {
              return <Skeleton className="h-72 w-full" />;
            }
            if (chartData.length > 0) {
              return (
                <ChartContainer config={windowTypeTapsConfig} className="h-72 w-full">
                  <BarChart data={chartData}>
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
                    <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              );
            }
            return (
              <p className="text-sm text-muted-foreground text-center py-8">
                No window data available
              </p>
            );
          })()}
        </div>

        {/* Right: Pie chart — Taps by Window (event selected) or Taps by Event (no event) */}
        {selectedEventId ? (
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-foreground">Taps by Window</h3>
              <p className="text-sm text-muted-foreground mt-1">Tap distribution across redirect windows</p>
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
                No window data available
              </p>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-foreground">Taps by Event</h3>
              <p className="text-sm text-muted-foreground mt-1">Tap distribution across events</p>
            </div>
            {summaryLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : eventPieData.length > 0 && eventPieTotal > 0 ? (
              <ChartContainer config={eventPieConfig} className="h-72 w-full">
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `${Number(value).toLocaleString()} taps`}
                      />
                    }
                  />
                  <Pie
                    data={eventPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    label={({ name, percent }) =>
                      `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`
                    }
                  >
                    {eventPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No tap data available
              </p>
            )}
          </div>
        )}
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
