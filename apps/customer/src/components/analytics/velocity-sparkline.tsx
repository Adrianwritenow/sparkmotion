'use client';

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { LineChart, Line } from "recharts";

const chartConfig = {
  value: {
    label: "Velocity",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

interface VelocitySparklineProps {
  eventId: string;
}

export function VelocitySparkline({ eventId }: VelocitySparklineProps) {
  const { data, isLoading } = trpc.analytics.velocityHistory.useQuery(
    { eventId },
    { refetchInterval: 10000 }
  );

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Velocity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[80px] w-[200px] flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform data for recharts
  const chartData = data.map((item) => ({
    bucket: item.bucket,
    value: item.count,
  }));

  // Calculate color based on threshold
  const getStrokeColor = () => {
    if (chartData.length === 0) return '#9ca3af'; // gray

    const values = chartData.map(d => d.value);
    const total = values.reduce((sum, val) => sum + val, 0);
    const avg = total / values.length;
    const latest = values[values.length - 1];

    if (avg === 0 || latest === undefined) return '#9ca3af'; // gray for no data
    if (latest > avg * 2) return '#f59e0b'; // yellow
    if (latest > avg * 5) return '#ef4444'; // red
    return '#10b981'; // green
  };

  const strokeColor = getStrokeColor();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Velocity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[80px] w-[200px]">
          <LineChart data={chartData}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={strokeColor}
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
