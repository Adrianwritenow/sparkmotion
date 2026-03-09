"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@sparkmotion/ui/card";
import { Skeleton } from "@sparkmotion/ui/skeleton";
import { Badge } from "@sparkmotion/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sparkmotion/ui/table";
import { formatDistanceToNow } from "date-fns";

const TYPE_VARIANTS: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
  hub_db_fallback: "destructive",
  auto_assign_failed: "default",
  no_org_slug: "secondary",
  worker_log_failed: "destructive",
  cron_batch_failed: "destructive",
};

const TYPE_LABELS: Record<string, string> = {
  hub_db_fallback: "DB Fallback",
  auto_assign_failed: "Auto-Assign",
  no_org_slug: "No Org Slug",
  worker_log_failed: "Worker Log",
  cron_batch_failed: "Cron Batch",
};

export function RecentErrorsCard() {
  const { data, isLoading } = trpc.infrastructure.getRecentErrors.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Errors</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const errors = data ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Recent Errors</CardTitle>
      </CardHeader>
      <CardContent>
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No recent errors
          </p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Time</TableHead>
                  <TableHead className="w-[110px]">Type</TableHead>
                  <TableHead>Band ID</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((err, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(err.ts), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TYPE_VARIANTS[err.type] ?? "outline"} className="text-xs">
                        {TYPE_LABELS[err.type] ?? err.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {err.bandId ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[300px] truncate" title={err.reason}>
                      {err.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
