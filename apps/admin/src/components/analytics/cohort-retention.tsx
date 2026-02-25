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

interface CohortRetentionProps {
  eventId: string;
}

export function CohortRetention({ eventId }: CohortRetentionProps) {
  const { data, isLoading } = trpc.analytics.cohortRetention.useQuery({ eventId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cohort Retention</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalBands === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cohort Retention</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No band tap data for this event</p>
        </CardContent>
      </Card>
    );
  }

  const buckets = [
    { label: "Day 1", value: data.day1 },
    { label: "Day 3", value: data.day3 },
    { label: "Day 7", value: data.day7 },
    { label: "Day 14", value: data.day14 },
    { label: "Day 30", value: data.day30 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cohort Retention</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {data.totalBands.toLocaleString()} bands with taps
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              {buckets.map((b) => (
                <TableHead key={b.label} className="text-center">{b.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              {buckets.map((b) => (
                <TableCell key={b.label} className="text-center font-medium">
                  {b.value}%
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
