"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Users,
  MousePointerClick,
  Activity,
  CalendarIcon,
  X,
} from "lucide-react";

const engagementConfig = {
  count: {
    label: "Taps",
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

const modeBarConfig = {
  count: {
    label: "Taps",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

interface OrgOverviewAnalyticsProps {
  orgId: string;
  orgName: string;
  events: Array<{ id: string; name: string }>;
}

export function OrgOverviewAnalytics({
  orgId,
  orgName,
  events,
}: OrgOverviewAnalyticsProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(
    undefined
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Build shared filter params — use wide default range when no date selected
  const from =
    dateRange?.from
      ? format(dateRange.from, "yyyy-MM-dd'T'00:00:00.000'Z'")
      : "2020-01-01T00:00:00.000Z";
  const to =
    dateRange?.to
      ? format(dateRange.to, "yyyy-MM-dd'T'23:59:59.999'Z'")
      : format(new Date(), "yyyy-MM-dd'T'23:59:59.999'Z'");

  const sharedParams = {
    from,
    to,
    orgId,
    ...(selectedEventId ? { eventId: selectedEventId } : {}),
  };

  // Queries
  const { data: tapsByDay, isLoading: tapsByDayLoading } =
    trpc.analytics.tapsByDay.useQuery(sharedParams);

  const { data: kpis, isLoading: kpisLoading } =
    trpc.analytics.kpis.useQuery(sharedParams);

  const { data: topEvents, isLoading: topEventsLoading } =
    trpc.analytics.topEvents.useQuery(
      { from, to, orgId },
      { enabled: !selectedEventId }
    );

  const { data: windowTaps, isLoading: windowTapsLoading } =
    trpc.analytics.tapsByWindow.useQuery(
      {
        eventId: selectedEventId!,
        ...(dateRange?.from && dateRange?.to ? { from, to } : {}),
      },
      { enabled: !!selectedEventId }
    );

  const hasActiveFilters = !!selectedEventId || !!dateRange;

  const clearFilters = () => {
    setSelectedEventId(undefined);
    setDateRange(undefined);
  };

  const handleEventChange = (value: string) => {
    setSelectedEventId(value === "all" ? undefined : value);
  };

  // Subtitle
  const filterSubtitle =
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
      : "All time interaction data";

  // Mode distribution bar chart data from kpis
  const modeBarData = kpis?.modeDistribution
    ? Object.entries(kpis.modeDistribution).map(([type, count]) => ({
        type,
        count,
      }))
    : [];

  // Right chart: pie data
  // When no event selected → "Taps by Event" from topEvents
  // When event selected → "Taps by Window" from tapsByWindow
  const rightChartTitle = selectedEventId ? "Taps by Window" : "Taps by Event";
  const rightChartSubtitle = selectedEventId
    ? "Tap distribution across redirect windows"
    : "Tap distribution across events";

  const pieSlices = selectedEventId
    ? (windowTaps ?? []).map((w) => ({
        name: `${w.windowType} - ${w.title || "Untitled"}`,
        value: w.count,
      }))
    : (topEvents ?? []).map((e) => ({
        name: e.eventName,
        value: e.tapCount,
      }));

  const pieTotal = pieSlices.reduce((s, d) => s + d.value, 0);
  const pieConfig = pieSlices.reduce<ChartConfig>((acc, item, i) => {
    acc[item.name] = {
      label: item.name,
      color: PIE_COLORS[i % PIE_COLORS.length],
    };
    return acc;
  }, {});

  const rightChartLoading = selectedEventId
    ? windowTapsLoading
    : topEventsLoading;

  return (
    <div className="space-y-6">
      {/* Filter bar */}
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

        {/* Event selector */}
        <Select
          value={selectedEventId ?? "all"}
          onValueChange={handleEventChange}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
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
      </div>

      {/* Section 1: Line chart — Organization Engagement */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground">
            Organization Engagement
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {filterSubtitle}
          </p>
        </div>
        {tapsByDayLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ChartContainer config={engagementConfig} className="h-72 w-full">
            <LineChart data={tapsByDay ?? []}>
              <CartesianGrid
                vertical={false}
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 12,
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 12,
                }}
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
        )}
      </div>

      {/* Section 2: Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Total Bands"
          value={kpisLoading ? null : (kpis?.uniqueBands ?? 0)}
          icon={<Users className="w-4 h-4 text-primary" />}
          loading={kpisLoading}
        />
        <StatCard
          title="Total Taps"
          value={kpisLoading ? null : (kpis?.totalTaps ?? 0)}
          icon={<MousePointerClick className="w-4 h-4 text-primary" />}
          loading={kpisLoading}
        />
        <StatCard
          title="Band Activity"
          value={kpisLoading ? null : `${kpis?.bandActivityPercent ?? 0}%`}
          icon={<Activity className="w-4 h-4 text-primary" />}
          loading={kpisLoading}
        />
      </div>

      {/* Section 3: Two side-by-side charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Bar chart — Taps by Mode */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              Taps by Mode
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Aggregated by redirect mode (PRE / LIVE / POST)
            </p>
          </div>
          {kpisLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : modeBarData.length > 0 ? (
            <ChartContainer
              config={modeBarConfig}
              className="h-72 w-full"
            >
              <BarChart data={modeBarData}>
                <CartesianGrid
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="type"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{
                    fill: "hsl(var(--muted-foreground))",
                    fontSize: 12,
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{
                    fill: "hsl(var(--muted-foreground))",
                    fontSize: 12,
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        `${Number(value).toLocaleString()} taps`
                      }
                    />
                  }
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--chart-1))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No mode data available
            </p>
          )}
        </div>

        {/* Right: Pie chart — Taps by Event or Taps by Window */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              {rightChartTitle}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {rightChartSubtitle}
            </p>
          </div>
          {rightChartLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : pieSlices.length > 0 && pieTotal > 0 ? (
            <ChartContainer
              config={pieConfig}
              className="h-72 w-full"
            >
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        `${Number(value).toLocaleString()} taps`
                      }
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
                    <Cell
                      key={i}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <ChartLegend
                  content={<ChartLegendContent nameKey="name" />}
                />
              </PieChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No data available
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
