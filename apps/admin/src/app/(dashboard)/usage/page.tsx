"use client";

import { useState } from "react";
import { Toaster } from "sonner";
import { CurrentActivityCard } from "@/components/usage/current-activity-card";
import { InfrastructureControlCard } from "@/components/usage/infrastructure-control-card";
import { UpcomingEventsCard } from "@/components/usage/upcoming-events-card";
import { CostProjectionCard } from "@/components/usage/cost-projection-card";
import { LoadTestReportsDialog } from "@/components/usage/load-test-reports-dialog";
import { Button } from "@/components/ui/button";

export default function UsagePage() {
  const [reportsOpen, setReportsOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Toaster />

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Usage & Infrastructure</h2>
        <Button variant="outline" onClick={() => setReportsOpen(true)}>
          Load Test Reports
        </Button>
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

      <LoadTestReportsDialog open={reportsOpen} onOpenChange={setReportsOpen} />
    </div>
  );
}
