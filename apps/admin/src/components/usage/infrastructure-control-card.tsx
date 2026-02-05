"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export function InfrastructureControlCard() {
  const [customCount, setCustomCount] = useState<number>(2);

  const { data: serviceStatus, isLoading: statusLoading } = trpc.infrastructure.getServiceStatus.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const { data: mapStatus, isLoading: mapLoading } = trpc.infrastructure.getMapStatus.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const scaleMutation = trpc.infrastructure.scale.useMutation({
    onSuccess: (data) => {
      toast.success(`Scaling to ${data.desiredCount} tasks`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const refreshMapMutation = trpc.infrastructure.refreshMap.useMutation({
    onSuccess: (data) => {
      if (data.skipped) {
        toast.info("Redirect map refresh skipped (no changes)");
      } else {
        toast.success(`Redirect map refreshed: ${data.bandsWritten} bands, ${data.eventsProcessed} events`);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleScale = (desiredCount: number) => {
    if (desiredCount < 2 || desiredCount > 100) {
      toast.error("Task count must be between 2 and 100");
      return;
    }
    scaleMutation.mutate({ desiredCount });
  };

  const handleRefreshMap = () => {
    refreshMapMutation.mutate();
  };

  if (statusLoading || mapLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure Control</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isScaling = serviceStatus && serviceStatus.runningCount !== serviceStatus.desiredCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Infrastructure Control</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scaling Section */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">ECS Service Scaling</h3>
          
          {serviceStatus?.configured === false ? (
            <Badge variant="secondary">ECS Not Configured</Badge>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm">
                  <span className="font-medium">Current:</span> {serviceStatus?.runningCount ?? 0} / {serviceStatus?.desiredCount ?? 0} tasks
                </span>
                {isScaling && (
                  <Badge variant="outline">Scaling in progress...</Badge>
                )}
              </div>

              {/* Preset buttons */}
              <div className="flex gap-2 mb-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleScale(10)}
                  disabled={scaleMutation.isPending}
                >
                  Scale to 10
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleScale(30)}
                  disabled={scaleMutation.isPending}
                >
                  Scale to 30
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleScale(50)}
                  disabled={scaleMutation.isPending}
                >
                  Scale to 50
                </Button>
              </div>

              {/* Custom input */}
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={2}
                  max={100}
                  value={customCount}
                  onChange={(e) => setCustomCount(parseInt(e.target.value, 10))}
                  placeholder="Custom count"
                  className="w-32"
                />
                <Button
                  size="sm"
                  onClick={() => handleScale(customCount)}
                  disabled={scaleMutation.isPending}
                >
                  Scale
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Redirect Map Section */}
        <div className="pt-6 border-t">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Redirect Map Status</h3>
          
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
            className="mt-3 w-full"
          >
            {refreshMapMutation.isPending ? "Refreshing..." : "Force Refresh"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
