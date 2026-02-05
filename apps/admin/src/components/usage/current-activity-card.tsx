"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function CurrentActivityCard() {
  const { data: events, isLoading: eventsLoading } = trpc.events.list.useQuery();
  const { data: serviceStatus, isLoading: statusLoading } = trpc.infrastructure.getServiceStatus.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const activeEvents = events?.filter((e) => e.status === "ACTIVE") ?? [];

  if (eventsLoading || statusLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live Events Section */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Live Events</h3>
          {activeEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active events</p>
          ) : (
            <div className="space-y-2">
              {activeEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{event.name}</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{event._count.bands?.toLocaleString() ?? 0} bands</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ECS Status Section */}
        <div className="pt-4 border-t">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">ECS Service</h3>
          {serviceStatus?.configured === false ? (
            <Badge variant="secondary">ECS Not Configured</Badge>
          ) : (
            <div className="text-sm">
              <p>
                <span className="font-medium">Running:</span> {serviceStatus?.runningCount ?? 0} / {serviceStatus?.desiredCount ?? 0} tasks
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
