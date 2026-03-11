"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

export interface CohortRetentionData {
  totalBands: number;
  day1: number;
  day3: number;
  day7: number;
  day14: number;
  day30: number;
}

interface CohortRetentionCardProps {
  data?: CohortRetentionData | null;
  isLoading?: boolean;
}

export function CohortRetentionCard({ data, isLoading }: CohortRetentionCardProps) {
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
                <TableHead key={b.label} className="text-center">
                  {b.label}
                </TableHead>
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
