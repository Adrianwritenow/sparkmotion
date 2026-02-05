"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export function UpcomingEventsCard() {
  const { data: events, isLoading } = trpc.events.list.useQuery();

  // Filter for upcoming events (events with windows starting in the future)
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const upcomingEvents = events
    ?.filter((event) => {
      // Check if event has windows in the next 30 days
      return event.windows.some((window) => {
        if (!window.startTime) return false;
        const startTime = new Date(window.startTime);
        return startTime >= now && startTime <= thirtyDaysFromNow;
      });
    })
    .map((event) => {
      // Find the earliest upcoming window
      const upcomingWindows = event.windows
        .filter((w) => w.startTime && new Date(w.startTime) >= now)
        .sort((a, b) => {
          if (!a.startTime || !b.startTime) return 0;
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });

      return {
        ...event,
        nextWindowStart: upcomingWindows[0]?.startTime,
      };
    })
    .sort((a, b) => {
      if (!a.nextWindowStart || !b.nextWindowStart) return 0;
      return new Date(a.nextWindowStart).getTime() - new Date(b.nextWindowStart).getTime();
    }) ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Events</CardTitle>
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
        <CardTitle>Upcoming Events</CardTitle>
      </CardHeader>
      <CardContent>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming events scheduled</p>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-b-0">
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {event.nextWindowStart ? format(new Date(event.nextWindowStart), "MMM d, yyyy 'at' h:mm a") : "N/A"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {event.estimatedAttendees ? event.estimatedAttendees.toLocaleString() : "N/A"}
                  </p>
                  <p className="text-muted-foreground text-xs">attendees</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
