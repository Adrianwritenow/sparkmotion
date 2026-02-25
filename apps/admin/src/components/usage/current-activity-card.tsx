"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function CurrentActivityCard() {
  const { data: events, isLoading } = trpc.events.list.useQuery();

  const activeEvents = events?.filter((e) => e.status === "ACTIVE") ?? [];

  if (isLoading) {
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
      <CardContent>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Live Events</h3>
        {activeEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active events</p>
        ) : (
          <div className="space-y-2">
            {activeEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{event.name}</span>
                <span className="text-muted-foreground">
                  {event._count.bands?.toLocaleString() ?? 0} bands
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
