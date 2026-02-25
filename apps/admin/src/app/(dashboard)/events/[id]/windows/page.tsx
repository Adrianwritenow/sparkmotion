import { db } from "@sparkmotion/database";
import { notFound } from "next/navigation";
import { WindowsList } from "@/components/events/windows-list";

export default async function EventWindowsPage({
  params,
}: {
  params: { id: string };
}) {
  const event = await db.event.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Event Windows</h1>
        <p className="text-muted-foreground mt-2">{event.name}</p>
      </div>

      <WindowsList eventId={event.id} />
    </div>
  );
}
