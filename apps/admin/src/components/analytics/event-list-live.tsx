'use client';

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface EventListLiveProps {
  onSelectEvent: (eventId: string) => void;
  selectedEventId: string | null;
}

export function EventListLive({ onSelectEvent, selectedEventId }: EventListLiveProps) {
  const { data: events, isLoading } = trpc.events.list.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!events || events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No events found</p>
        </CardContent>
      </Card>
    );
  }

  // Sort events by creation date (most recent first)
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA;
  });

  const getModeBadgeClasses = (mode: string) => {
    const modeUpper = mode.toUpperCase();
    if (modeUpper === 'PRE') {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (modeUpper === 'LIVE') {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    if (modeUpper === 'POST') {
      return 'bg-gray-100 text-gray-800 border-gray-200';
    }
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // Determine current mode based on active windows
  const getCurrentMode = (event: typeof events[0]): string => {
    const now = new Date();
    const liveWindow = event.windows.find(w => w.windowType === 'LIVE');
    const preWindow = event.windows.find(w => w.windowType === 'PRE');

    // Manual override
    const manualWindow = event.windows.find(w => w.isManual && w.isActive);
    if (manualWindow) {
      return manualWindow.windowType.toLowerCase();
    }

    // Check if LIVE window is currently active
    if (liveWindow?.startTime && liveWindow?.endTime) {
      const start = new Date(liveWindow.startTime);
      const end = new Date(liveWindow.endTime);
      if (now >= start && now <= end) {
        return 'live';
      }
      if (now > end) {
        return 'post';
      }
    }

    return 'pre';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Events</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sortedEvents.map((event) => (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selectedEventId === event.id
                  ? 'bg-primary/5 border-primary'
                  : 'hover:bg-muted border-transparent'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{event.name}</div>
                </div>
                <Badge
                  className={getModeBadgeClasses(getCurrentMode(event))}
                  variant="outline"
                >
                  {getCurrentMode(event).toUpperCase()}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
