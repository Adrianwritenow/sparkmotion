"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";

const MODE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
];

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
  const total = (dist.PRE ?? 0) + (dist.LIVE ?? 0) + (dist.POST ?? 0);

  const chartData = [
    { name: "PRE", value: dist.PRE ?? 0 },
    { name: "LIVE", value: dist.LIVE ?? 0 },
    { name: "POST", value: dist.POST ?? 0 },
  ];

  const chartConfig: ChartConfig = {
    PRE: { label: "PRE", color: MODE_COLORS[0] },
    LIVE: { label: "LIVE", color: MODE_COLORS[1] },
    POST: { label: "POST", color: MODE_COLORS[2] },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mode Split</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No tap data available
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => `${Number(value).toLocaleString()} taps`}
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                label={({ name, percent }) =>
                  `${name ?? ""} (${((percent ?? 0) * 100).toFixed(0)}%)`
                }
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={MODE_COLORS[i % MODE_COLORS.length]} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
