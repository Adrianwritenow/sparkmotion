"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface EventComparisonProps {
  from: string;
  to: string;
}

export function EventComparison({ from, to }: EventComparisonProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: events } = trpc.events.list.useQuery();

  const { data: comparison, isLoading: isComparing } =
    trpc.analytics.compareEvents.useQuery(
      { eventIds: selectedIds, from, to },
      { enabled: selectedIds.length >= 2 }
    );

  const toggleEvent = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 5
        ? [...prev, id]
        : prev
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event Comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {events?.map((event) => (
            <Button
              key={event.id}
              variant={selectedIds.includes(event.id) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleEvent(event.id)}
            >
              {event.name}
            </Button>
          ))}
        </div>

        {selectedIds.length < 2 && (
          <p className="text-sm text-muted-foreground">Select 2-5 events to compare</p>
        )}

        {isComparing && <Skeleton className="h-32 w-full" />}

        {comparison && comparison.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>City</TableHead>
                <TableHead className="text-right">Total Taps</TableHead>
                <TableHead className="text-right">Unique Bands</TableHead>
                <TableHead className="text-right">Peak TPM</TableHead>
                <TableHead className="text-right">Post-Event</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.map((row) => (
                <TableRow key={row.eventId}>
                  <TableCell className="font-medium">{row.eventName}</TableCell>
                  <TableCell>{row.city ?? "—"}</TableCell>
                  <TableCell className="text-right">{row.totalTaps.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.uniqueBands.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.peakTpm.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.postEventTaps.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
