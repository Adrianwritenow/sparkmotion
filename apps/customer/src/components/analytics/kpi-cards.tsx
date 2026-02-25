"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiCardsProps {
  from: string;
  to: string;
  eventId?: string;
  orgId?: string;
}

function formatValue(value: number, format: string): string {
  switch (format) {
    case "number":
      return value.toLocaleString();
    case "decimal":
      return value.toFixed(2);
    case "percent":
      return `${value}%`;
    default:
      return String(value);
  }
}

export function KpiCards({ from, to, eventId, orgId }: KpiCardsProps) {
  const { data, isLoading } = trpc.analytics.kpis.useQuery({ from, to, eventId, orgId });

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const kpis = [
    { title: "Total Taps", value: data?.totalTaps ?? 0, format: "number" },
    { title: "Unique Bands", value: data?.uniqueBands ?? 0, format: "number" },
    { title: "Active Events", value: data?.activeEvents ?? 0, format: "number" },
    { title: "Taps/Min", value: data?.tpm ?? 0, format: "decimal" },
    { title: "Peak TPM", value: data?.peakTpm ?? 0, format: "number" },
    { title: "Band Activity", value: data?.bandActivityPercent ?? 0, format: "percent" },
    { title: "Avg Taps/Band", value: data?.avgTapsPerBand ?? 0, format: "decimal" },
    { title: "Post-Event Taps", value: data?.postEventTaps ?? 0, format: "number" },
    {
      title: "Mode Split",
      value: null,
      format: "custom",
      render: () => {
        const dist = data?.modeDistribution ?? { PRE: 0, LIVE: 0, POST: 0 };
        return (
          <div className="flex gap-3 text-sm">
            <span>PRE: {dist.PRE?.toLocaleString()}</span>
            <span>LIVE: {dist.LIVE?.toLocaleString()}</span>
            <span>POST: {dist.POST?.toLocaleString()}</span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      {kpis.map((kpi) => (
        <Card key={kpi.title}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {kpi.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {kpi.format === "custom" && kpi.render ? (
              kpi.render()
            ) : (
              <div className="text-2xl font-bold">
                {formatValue(kpi.value as number, kpi.format)}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
