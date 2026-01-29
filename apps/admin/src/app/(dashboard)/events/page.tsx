"use client";

import { EventsTable } from "@/components/events/events-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

export default function EventsPage() {
  const { data: events, isLoading } = trpc.events.list.useQuery();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold">Events</h2>
        <Button asChild>
          <Link href="/events/new">Create Event</Link>
        </Button>
      </div>

      {isLoading ? <div>Loading...</div> : <EventsTable data={events ?? []} />}
    </div>
  );
}
