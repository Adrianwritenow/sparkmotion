"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type TimeRange = "7" | "14" | "30";

export function CostProjectionCard() {
  const [selectedRange, setSelectedRange] = useState<TimeRange>("7");

  const { data, isLoading } = trpc.infrastructure.costProjection.useQuery(
    { days: selectedRange },
    { enabled: true }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost Projection</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = data && data.upcomingEvents.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Cost Projection</CardTitle>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={selectedRange === "7" ? "default" : "outline"}
              onClick={() => setSelectedRange("7")}
            >
              7d
            </Button>
            <Button
              size="sm"
              variant={selectedRange === "14" ? "default" : "outline"}
              onClick={() => setSelectedRange("14")}
            >
              14d
            </Button>
            <Button
              size="sm"
              variant={selectedRange === "30" ? "default" : "outline"}
              onClick={() => setSelectedRange("30")}
            >
              30d
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground">
            No events with attendee estimates in the next {selectedRange} days
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Total Attendees</p>
                <p className="text-lg font-semibold">{data.totalEstimatedAttendees.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expected Taps</p>
                <p className="text-lg font-semibold">{data.totalExpectedTaps.toLocaleString()}</p>
              </div>
            </div>

            <div className="pt-3 border-t space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Workers:</span>
                <span className="font-medium">${data.workersCost.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">KV Reads:</span>
                <span className="font-medium">${data.kvCost.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Upstash:</span>
                <span className="font-medium">${data.upstashCost.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="font-medium">Total Estimated Cost:</span>
                <span className="text-lg font-bold">${data.totalCost.toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-3 border-t text-xs text-muted-foreground">
              <p>Based on {data.upcomingEvents.length} event(s) with {data.totalWindows} window(s) across {data.uniqueEventDays} day(s)</p>
              <p>1 tap per attendee per window ({data.totalExpectedTaps.toLocaleString()} total taps)</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
