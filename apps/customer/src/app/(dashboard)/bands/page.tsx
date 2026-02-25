import { BandReviewTable } from "@/components/bands/band-review-table";

export default function BandsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Activity
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor scan activity and manage bands across your events
        </p>
      </div>

      <BandReviewTable />
    </div>
  );
}
