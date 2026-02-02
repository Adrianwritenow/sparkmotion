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

interface TopOrgsTableProps {
  from: string;
  to: string;
}

export function TopOrgsTable({ from, to }: TopOrgsTableProps) {
  const { data, isLoading } = trpc.analytics.topOrgs.useQuery({ from, to });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Organizations</CardTitle>
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
          <CardTitle>Top Organizations</CardTitle>
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
        <CardTitle>Top Organizations</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead className="text-right">Taps</TableHead>
              <TableHead className="text-right">TPM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((org, index) => (
              <TableRow key={org.orgId}>
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>{org.orgName}</TableCell>
                <TableCell className="text-right">{org.eventCount}</TableCell>
                <TableCell className="text-right">{org.tapCount.toLocaleString()}</TableCell>
                <TableCell className="text-right">{org.tpm}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
