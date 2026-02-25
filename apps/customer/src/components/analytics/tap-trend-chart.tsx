"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { format } from "date-fns";

const chartConfig = {
  count: {
    label: "Taps",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

interface TapTrendChartProps {
  from: string;
  to: string;
  eventId?: string;
}

export function TapTrendChart({ from, to, eventId }: TapTrendChartProps) {
  const { data, isLoading } = trpc.analytics.tapsByDay.useQuery({ from, to, eventId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tap Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Format data for Recharts
  const chartData = (data ?? []).map((item) => ({
    date: item.date ? format(new Date(item.date), "MMM dd") : "",
    count: item.count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tap Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--color-count)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
