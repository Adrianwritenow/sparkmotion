"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiCardsProps {
  from: string;
  to: string;
}

export function KpiCards({ from, to }: KpiCardsProps) {
  const { data, isLoading } = trpc.analytics.kpis.useQuery({ from, to });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const kpis = [
    { title: "Total Taps", value: data?.totalTaps ?? 0 },
    { title: "Unique Bands", value: data?.uniqueBands ?? 0 },
    { title: "Active Events", value: data?.activeEvents ?? 0 },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {kpis.map((kpi) => (
        <Card key={kpi.title}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {kpi.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.value.toLocaleString()}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
