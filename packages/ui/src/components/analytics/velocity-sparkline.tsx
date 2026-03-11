"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ChartContainer, type ChartConfig } from "../ui/chart";
import { LineChart, Line } from "recharts";

const chartConfig = {
  value: {
    label: "Velocity",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export interface VelocityPoint {
  bucket: string;
  count: number;
}

interface VelocitySparklineCardProps {
  data?: VelocityPoint[] | null;
  isLoading?: boolean;
}

export function VelocitySparklineCard({ data, isLoading }: VelocitySparklineCardProps) {
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
    if (chartData.length === 0) return "#9ca3af"; // gray

    const values = chartData.map((d) => d.value);
    const total = values.reduce((sum, val) => sum + val, 0);
    const avg = total / values.length;
    const latest = values[values.length - 1];

    if (avg === 0 || latest === undefined) return "#9ca3af"; // gray for no data
    if (latest > avg * 5) return "#ef4444"; // red
    if (latest > avg * 2) return "#f59e0b"; // yellow
    return "#10b981"; // green
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
