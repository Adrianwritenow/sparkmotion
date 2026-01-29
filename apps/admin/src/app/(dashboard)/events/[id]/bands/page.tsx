import { db } from "@sparkmotion/database";
import { notFound } from "next/navigation";
import { BandCsvUpload } from "@/components/bands/band-csv-upload";
import { BandsTable } from "@/components/bands/bands-table";

export default async function BandsPage({
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
      <h1 className="text-2xl font-bold tracking-tight">
        Bands &mdash; {event.name}
      </h1>
      <BandCsvUpload eventId={event.id} />
      <BandsTable eventId={event.id} />
    </div>
  );
}
