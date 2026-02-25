"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { ModeIndicator } from "./mode-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import { EventStatus } from "@sparkmotion/database";

const statusVariants: Record<EventStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  DRAFT: "secondary",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

interface EventModeHeaderProps {
  eventId: string;
}

export function EventModeHeader({ eventId }: EventModeHeaderProps) {
  const { data: event, isLoading, refetch } = trpc.events.byId.useQuery({ id: eventId });

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let isVisible = true;

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;

      if (isVisible) {
        // Resume polling when tab becomes visible
        refetch();
        intervalId = setInterval(() => {
          refetch();
        }, 5000);
      } else {
        // Pause polling when tab is hidden
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    // Start polling
    intervalId = setInterval(() => {
      refetch();
    }, 5000);

    // Listen for visibility changes
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refetch]);

  if (isLoading || !event) {
    return (
      <div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-5 w-48 mt-2" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
        <Badge variant={statusVariants[event.status]}>{event.status}</Badge>
        <ModeIndicator mode={event.currentMode.toLowerCase() as "pre" | "live" | "post"} />
      </div>
      <p className="text-muted-foreground mt-2">{event.org?.name}</p>
    </div>
  );
}
