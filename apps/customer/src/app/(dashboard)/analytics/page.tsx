"use client";

import { useState, useRef, useEffect, type RefObject } from "react";
import { endOfDay, formatISO } from "date-fns";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { KpiCards } from "@/components/analytics/kpi-cards";
import { TapTrendChart } from "@/components/analytics/tap-trend-chart";
import { TopEventsTable } from "@/components/analytics/top-events-table";
import { EventListLive } from "@/components/analytics/event-list-live";
import { LiveKpiCards } from "@/components/analytics/live-kpi-cards";
import { ConnectionStatus } from "@/components/analytics/connection-status";
import { VelocitySparkline } from "@/components/analytics/velocity-sparkline";
import { ExportCsvButton } from "@/components/analytics/export-csv-button";
import { CohortRetention } from "@/components/analytics/cohort-retention";
import { EventComparison } from "@/components/analytics/event-comparison";
import { useEventStream } from "@/hooks/use-event-stream";
import { Card, CardContent } from "@/components/ui/card";

export default function AnalyticsPage() {
  // Default to all time for historical analytics
  const [from, setFrom] = useState("2020-01-01T00:00:00.000Z");
  const [to, setTo] = useState(() => formatISO(endOfDay(new Date())));

  // Real-time section state
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { connectionState, data, lastUpdated, retry } = useEventStream(selectedEventId);

  // Track previous mode for toast notifications
  const previousModeRef = useRef<string | null>(null);

  useEffect(() => {
    if (data?.mode && previousModeRef.current && previousModeRef.current !== data.mode) {
      toast(`Event mode changed to ${data.mode.toUpperCase()}`);
    }
    if (data?.mode) {
      previousModeRef.current = data.mode;
    }
  }, [data?.mode]);

  const handleRangeChange = (newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
  };

  const isStale = connectionState === 'disconnected';
  const analyticsRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Analytics</h2>
      </div>

      <ConnectionStatus
        state={connectionState}
        lastUpdated={lastUpdated}
        onRetry={retry}
      />

      {/* Real-time section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <EventListLive
            onSelectEvent={setSelectedEventId}
            selectedEventId={selectedEventId}
          />
        </div>
        <div className="lg:col-span-2 space-y-4">
          {selectedEventId ? (
            <>
              <LiveKpiCards data={data} isStale={isStale} />
              <VelocitySparkline eventId={selectedEventId} />
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Select an event to see real-time data
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="border-t pt-6" ref={analyticsRef}>
        <h3 className="text-xl font-semibold mb-4">Historical Analytics</h3>
        <div className="flex items-center justify-between mb-4">
          <ExportCsvButton from={from} to={to} eventId={selectedEventId ?? undefined} captureRef={analyticsRef} />
          <DateRangeFilter from={from} to={to} onRangeChange={handleRangeChange} />
        </div>

        <KpiCards from={from} to={to} />

        <div className="grid gap-6 lg:grid-cols-2 mt-6">
          <TapTrendChart from={from} to={to} />
          <TopEventsTable from={from} to={to} />
        </div>

        {selectedEventId && (
          <div className="mt-6">
            <CohortRetention eventId={selectedEventId} />
          </div>
        )}

        <div className="mt-6">
          <EventComparison from={from} to={to} />
        </div>
      </div>
    </div>
  );
}
