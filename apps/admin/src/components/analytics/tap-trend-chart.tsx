"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { format } from "date-fns";

interface TapTrendChartProps {
  from: string;
  to: string;
}

export function TapTrendChart({ from, to }: TapTrendChartProps) {
  const { data, isLoading } = trpc.analytics.tapsByDay.useQuery({ from, to });

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
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
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
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
