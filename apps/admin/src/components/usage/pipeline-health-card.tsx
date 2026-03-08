"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@sparkmotion/ui/card";
import { Skeleton } from "@sparkmotion/ui/skeleton";
import { Badge } from "@sparkmotion/ui/badge";
import { Button } from "@sparkmotion/ui/button";

const ERROR_LABELS: Record<string, string> = {
  hubDbFallback: "DB Fallback",
  autoAssignFailed: "Auto-Assign",
  noOrgSlug: "No Org Slug",
  workerLogFailed: "Worker Log",
  cronBatchFailed: "Cron Batch",
};

export function PipelineHealthCard() {
  const { data, isLoading } = trpc.infrastructure.getTapPipelineHealth.useQuery(
    undefined,
    { refetchInterval: 10_000 }
  );
  const utils = trpc.useUtils();
  const reset = trpc.infrastructure.resetErrorCounters.useMutation({
    onSuccess: () => {
      utils.infrastructure.getTapPipelineHealth.invalidate();
      utils.infrastructure.getRecentErrors.invalidate();
    },
  });

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
  const hasErrors = (data?.errors?.total ?? 0) > 0;

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

        {hasErrors && data?.errors && (
          <>
            <div className="mt-4 border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">
                  Redirect Errors{" "}
                  <span className="text-muted-foreground">({data.errors.total.toLocaleString()})</span>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => reset.mutate()}
                  disabled={reset.isPending}
                >
                  {reset.isPending ? "Resetting..." : "Reset"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {Object.entries(ERROR_LABELS).map(([key, label]) => {
                  const value = data.errors[key as keyof typeof data.errors] as number;
                  if (value === 0) return null;
                  return <Stat key={key} label={label} value={value} />;
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground" title="Worker log failures may be undercounted if Upstash was fully unreachable.">
                Worker errors may be undercounted if Upstash was fully down
              </p>
            </div>
          </>
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
