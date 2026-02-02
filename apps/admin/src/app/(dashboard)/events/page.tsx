import { db } from "@sparkmotion/database";
import { EventsContent } from "@/components/events/events-content";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function EventsPage() {
  const events = await db.event.findMany({
    include: {
      org: true,
      _count: {
        select: {
          bands: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold">Events</h2>
        <Button asChild>
          <Link href="/events/new">Create Event</Link>
        </Button>
      </div>

      <EventsContent data={events} />
    </div>
  );
}
