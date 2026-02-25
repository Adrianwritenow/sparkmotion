"use client";

export const dynamic = "force-dynamic";

import { CurrentActivityCard } from "@/components/usage/current-activity-card";
import { InfrastructureControlCard } from "@/components/usage/infrastructure-control-card";
import { UpcomingEventsCard } from "@/components/usage/upcoming-events-card";
import { CostProjectionCard } from "@/components/usage/cost-projection-card";

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Usage & Infrastructure</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          <CurrentActivityCard />
          <InfrastructureControlCard />
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <UpcomingEventsCard />
          <CostProjectionCard />
        </div>
      </div>
    </div>
  );
}
