import React from "react";
import { EventCard } from "./event-card";

interface Event {
  id: string;
  name: string;
  tourName?: string | null;
  status: string;
  _count: { bands: number };
}

interface EventListProps {
  events: Event[];
  onEventClick?: (eventId: string) => void;
}

export function EventList({ events, onEventClick }: EventListProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No events found.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => (
        <EventCard
          key={event.id}
          name={event.name}
          tourName={event.tourName}
          status={event.status}
          bandCount={event._count.bands}
          onClick={() => onEventClick?.(event.id)}
        />
      ))}
    </div>
  );
}
