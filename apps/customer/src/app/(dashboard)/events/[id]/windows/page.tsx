import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";
import { notFound, redirect } from "next/navigation";
import { WindowsList } from "@/components/events/windows-list";

export const dynamic = "force-dynamic";

export default async function EventWindowsPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();

  if (!session?.user?.orgId) {
    redirect("/signin");
  }

  const event = await db.event.findUnique({
    where: { id: params.id, deletedAt: null },
    select: { id: true, name: true, orgId: true },
  });

  if (!event || event.orgId !== session.user.orgId) {
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
