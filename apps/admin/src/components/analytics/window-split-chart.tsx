"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const windowChartConfig = {
  count: {
    label: "Taps",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

interface WindowSplitChartProps {
  eventId: string;
  from: string;
  to: string;
}

export function WindowSplitChart({ eventId, from, to }: WindowSplitChartProps) {
  const { data: windowData, isLoading } = trpc.analytics.tapsByWindow.useQuery(
    { eventId, from, to },
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Taps by Window</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (windowData ?? []).map((w) => ({
    label: w.title || `${w.windowType} - ${w.url.length > 25 ? w.url.slice(0, 25) + "..." : w.url}`,
    count: w.count,
    fill: "hsl(var(--chart-2))",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Taps by Window</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No windows configured for this event
          </p>
        ) : (
          <ChartContainer config={windowChartConfig} className="h-64 w-full">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                barSize={48}
                fill="hsl(var(--chart-2))"
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
