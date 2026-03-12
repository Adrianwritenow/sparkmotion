"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

export interface EventComparisonRow {
  eventId: string;
  eventName: string;
  city: string | null;
  totalTaps: number;
  uniqueBands: number;
  peakTpm: number;
  postEventTaps: number;
}

interface EventComparisonCardProps {
  events?: Array<{ id: string; name: string }> | null;
  selectedIds: string[];
  onToggleEvent: (id: string) => void;
  comparison?: EventComparisonRow[] | null;
  isComparing?: boolean;
}

export function EventComparisonCard({
  events,
  selectedIds,
  onToggleEvent,
  comparison,
  isComparing,
}: EventComparisonCardProps) {
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
              onClick={() => onToggleEvent(event.id)}
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
