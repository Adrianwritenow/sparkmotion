import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";
import { EventsTable } from "@/components/events/events-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function EventsPage() {
  const session = await auth();

  if (!session?.user?.orgId) {
    redirect("/signin");
  }

  const events = await db.event.findMany({
    where: { orgId: session.user.orgId },
    include: {
      _count: {
        select: { bands: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <p className="text-muted-foreground mt-2">
            Manage your organization's events
          </p>
        </div>
        <Button asChild>
          <Link href="/events/new">Create Event</Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">No events yet</h3>
            <p className="text-sm text-muted-foreground">
              Get started by creating your first event
            </p>
            <Button asChild>
              <Link href="/events/new">Create Event</Link>
            </Button>
          </div>
        </div>
      ) : (
        <EventsTable data={events} />
      )}
    </div>
  );
}
