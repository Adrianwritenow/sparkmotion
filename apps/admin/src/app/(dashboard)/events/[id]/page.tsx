import { db } from "@sparkmotion/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventStatus } from "@sparkmotion/database";

const statusVariants: Record<EventStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  DRAFT: "secondary",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

export default async function EventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const event = await db.event.findUnique({
    where: { id: params.id },
    include: {
      org: true,
      _count: {
        select: {
          bands: true,
          windows: true,
        },
      },
    },
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
          <Badge variant={statusVariants[event.status]}>{event.status}</Badge>
        </div>
        <p className="text-muted-foreground mt-2">{event.org.name}</p>
        {event.tourName && (
          <p className="text-sm text-muted-foreground">Tour: {event.tourName}</p>
        )}
      </div>

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
