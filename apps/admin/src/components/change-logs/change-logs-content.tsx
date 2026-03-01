"use client";

import { ChangeDetailSheet } from "./change-detail-sheet";
import { ChangeFilterBar } from "./change-filter-bar";
import { ChangeStats } from "./change-stats";
import { ChangeTable } from "./change-table";
import type { DateRange } from "react-day-picker";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export type ChangeRow = {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: { name: string | null; email: string } | null;
};

export function ChangeLogsContent() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [action, setAction] = useState<string | undefined>(undefined);
  const [resource, setResource] = useState<string | undefined>(undefined);
  const [selectedRow, setSelectedRow] = useState<ChangeRow | null>(null);

  const from = dateRange?.from?.toISOString();
  const to = dateRange?.to?.toISOString();

  function handleFilterChange<T>(setter: (val: T) => void) {
    return (val: T) => {
      setPage(1);
      setter(val);
    };
  }

  const { data: listData, isLoading: listLoading } = trpc.changeLogs.list.useQuery(
    { page, pageSize, from, to, userId, action, resource },
    { keepPreviousData: true }
  );

  const { data: statsData, isLoading: statsLoading } =
    trpc.changeLogs.stats.useQuery();

  const { data: usersData } = trpc.users.list.useQuery();

  const users = (usersData ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
  }));

  const rows = (listData?.rows ?? []) as ChangeRow[];

  return (
    <div className="space-y-6">
      <ChangeStats stats={statsData} isLoading={statsLoading} />

      <ChangeFilterBar
        dateRange={dateRange}
        onDateRangeChange={handleFilterChange(setDateRange)}
        userId={userId}
        onUserIdChange={handleFilterChange(setUserId)}
        action={action}
        onActionChange={handleFilterChange(setAction)}
        resource={resource}
        onResourceChange={handleFilterChange(setResource)}
        users={users}
        from={from}
        to={to}
      />

      <ChangeTable
        rows={rows}
        total={listData?.total ?? 0}
        page={page}
        pageSize={pageSize}
        isLoading={listLoading}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(1);
          setPageSize(size);
        }}
        onRowClick={setSelectedRow}
      />

      <ChangeDetailSheet
        row={selectedRow}
        open={!!selectedRow}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null);
        }}
      />
    </div>
  );
}
