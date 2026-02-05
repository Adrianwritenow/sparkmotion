"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export function InfrastructureControlCard() {
  const { data: mapStatus, isLoading } = trpc.infrastructure.getMapStatus.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const refreshMapMutation = trpc.infrastructure.refreshMap.useMutation({
    onSuccess: (data) => {
      if (data.skipped) {
        toast.info("Redirect map refresh skipped (Cloudflare KV not configured)");
      } else {
        toast.success(`Redirect map refreshed: ${data.bandsWritten} bands, ${data.eventsProcessed} events`);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleRefreshMap = () => {
    refreshMapMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Redirect Map</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Redirect Map</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">Cloudflare KV — synced from active events &amp; windows</p>

        <div className="space-y-2 text-sm">
          {mapStatus?.lastRefreshed ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last Refreshed:</span>
                <span>{formatDistanceToNow(new Date(mapStatus.lastRefreshed), { addSuffix: true })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Band Count:</span>
                <span>{mapStatus.bandCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Size:</span>
                <span>{(mapStatus.sizeBytes / 1024).toFixed(2)} KB</span>
              </div>
              {mapStatus.isStale && (
                <Badge variant="destructive" className="mt-2">Stale (&gt;5 min)</Badge>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No redirect map data</p>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleRefreshMap}
          disabled={refreshMapMutation.isPending}
          className="w-full"
        >
          {refreshMapMutation.isPending ? "Refreshing..." : "Force Refresh"}
        </Button>
      </CardContent>
    </Card>
  );
}
