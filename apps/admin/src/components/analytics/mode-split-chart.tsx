"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const modeChartConfig = {
  count: {
    label: "Taps",
  },
  PRE: {
    label: "PRE",
    color: "hsl(var(--chart-1))",
  },
  LIVE: {
    label: "LIVE",
    color: "hsl(var(--chart-2))",
  },
  POST: {
    label: "POST",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;

const MODE_COLORS: Record<string, string> = {
  PRE: "var(--color-PRE)",
  LIVE: "var(--color-LIVE)",
  POST: "var(--color-POST)",
};

interface ModeSplitChartProps {
  from: string;
  to: string;
  eventId?: string;
  orgId?: string;
}

export function ModeSplitChart({ from, to, eventId, orgId }: ModeSplitChartProps) {
  const { data: kpiData, isLoading } = trpc.analytics.kpis.useQuery(
    { from, to, eventId, orgId },
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mode Split</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const dist = kpiData?.modeDistribution ?? { PRE: 0, LIVE: 0, POST: 0 };
  const chartData = [
    { mode: "PRE", count: dist.PRE ?? 0, fill: MODE_COLORS.PRE },
    { mode: "LIVE", count: dist.LIVE ?? 0, fill: MODE_COLORS.LIVE },
    { mode: "POST", count: dist.POST ?? 0, fill: MODE_COLORS.POST },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mode Split</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={modeChartConfig} className="h-64 w-full">
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis
              dataKey="mode"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
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
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
