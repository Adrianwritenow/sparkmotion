import { db } from "@sparkmotion/database";
import { BandReviewTable } from "@/components/bands/band-review-table";

export const dynamic = "force-dynamic";

export default async function BandsPage() {
  const orgs = await db.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Activity
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor scan activity and manage bands across events
        </p>
      </div>

      <BandReviewTable orgs={orgs} />
    </div>
  );
}
