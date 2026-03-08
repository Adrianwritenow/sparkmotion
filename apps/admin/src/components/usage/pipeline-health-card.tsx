"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@sparkmotion/ui/card";
import { Skeleton } from "@sparkmotion/ui/skeleton";
import { Badge } from "@sparkmotion/ui/badge";

export function PipelineHealthCard() {
  const { data, isLoading } = trpc.infrastructure.getTapPipelineHealth.useQuery(
    undefined,
    { refetchInterval: 10_000 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tap Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const unavailable = data?.lost === -1;
  const healthy = data?.lost === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Tap Pipeline</CardTitle>
        {unavailable ? (
          <Badge variant="outline">Unavailable</Badge>
        ) : healthy ? (
          <Badge className="bg-green-600 hover:bg-green-600 text-white">Healthy</Badge>
        ) : (
          <Badge variant="destructive">{data?.lost?.toLocaleString()} Lost</Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Received" value={data?.received} />
          <Stat label="Flushed" value={data?.flushed} />
          <Stat label="Dropped" value={data?.dropped} />
          <Stat label="Pending" value={data?.pending} />
        </div>
        {!unavailable && !healthy && (
          <p className="mt-3 text-xs text-muted-foreground">
            Lost = Received - Flushed - Dropped - Pending
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">
        {value?.toLocaleString() ?? "—"}
      </p>
    </div>
  );
}
