"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TopEventsTableProps {
  from: string;
  to: string;
}

export function TopEventsTable({ from, to }: TopEventsTableProps) {
  const { data, isLoading } = trpc.analytics.topEvents.useQuery({ from, to });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Events</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Events</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No tap data for this period</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Events</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Event Name</TableHead>
              <TableHead className="text-right">Tap Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((event, index) => (
              <TableRow key={event.eventId}>
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>{event.eventName}</TableCell>
                <TableCell className="text-right">{event.tapCount.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
