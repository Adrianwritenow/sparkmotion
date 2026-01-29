"use client";

import { EventFormWrapper } from "@/components/events/event-form-wrapper";
import { trpc } from "@/lib/trpc";

export default function NewEventPage() {
  const { data: orgs, isLoading } = trpc.organizations.list.useQuery();

  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-bold mb-6">Create Event</h2>

      <div className="bg-white rounded-lg border p-6">
        {isLoading ? <div>Loading...</div> : <EventFormWrapper orgs={orgs ?? []} />}
      </div>
    </div>
  );
}
