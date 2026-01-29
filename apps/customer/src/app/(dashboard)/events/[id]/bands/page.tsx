import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";
import { notFound, redirect } from "next/navigation";
import { BandCsvUpload } from "@/components/bands/band-csv-upload";

export default async function BandsPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();

  if (!session?.user?.orgId) {
    redirect("/signin");
  }

  const event = await db.event.findUnique({
    where: { id: params.id, orgId: session.user.orgId },
    select: { id: true, name: true },
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">
        Bands &mdash; {event.name}
      </h1>
      <BandCsvUpload eventId={event.id} />
    </div>
  );
}
