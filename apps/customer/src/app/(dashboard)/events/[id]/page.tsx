import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventModeHeader } from "@/components/events/event-mode-header";

export default async function EventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();

  if (!session?.user?.orgId) {
    redirect("/signin");
  }

  const event = await db.event.findUnique({
    where: { id: params.id },
    include: {
      _count: {
        select: {
          bands: true,
          windows: true,
        },
      },
    },
  });

  if (!event || event.orgId !== session.user.orgId) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <EventModeHeader eventId={params.id} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-6">
          <div className="text-2xl font-bold">{event._count.bands}</div>
          <p className="text-xs text-muted-foreground">Bands Assigned</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <div className="text-2xl font-bold">{event._count.windows}</div>
          <p className="text-xs text-muted-foreground">Windows Scheduled</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Created</div>
          <p className="text-xs text-muted-foreground">
            {new Date(event.createdAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">URLs</h2>
        <div className="rounded-lg border p-4 space-y-3">
          <div>
            <span className="text-sm font-medium text-muted-foreground">Pre-Event:</span>
            <p className="text-sm break-all">{event.preUrl}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground">Live Event:</span>
            <p className="text-sm break-all">{event.liveUrl}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-muted-foreground">Post-Event:</span>
            <p className="text-sm break-all">{event.postUrl}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Button asChild>
          <Link href={`/events/${event.id}/windows`}>Manage Windows</Link>
        </Button>
      </div>
    </div>
  );
}
