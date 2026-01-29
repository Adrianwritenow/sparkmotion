import { db } from "@sparkmotion/database";
import { notFound } from "next/navigation";
import { WindowForm } from "@/components/events/window-form";
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

      <div className="max-w-2xl">
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Create New Window</h2>
          <WindowForm eventId={event.id} />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Scheduled Windows</h2>
        <WindowsList eventId={event.id} />
      </div>
    </div>
  );
}
