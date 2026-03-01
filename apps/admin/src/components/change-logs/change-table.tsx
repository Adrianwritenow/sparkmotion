"use client";

import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import Link from "next/link";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ChangeRow } from "./change-logs-content";

interface ChangeTableProps {
  rows: ChangeRow[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onRowClick: (row: ChangeRow) => void;
}

function formatAction(action: string): string {
  const parts = action.split(".");
  const verb = parts.length >= 2 ? parts.slice(1).join(" ") : action;
  return verb
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getActionBadge(action: string): { label: string; className: string } {
  if (action.includes("create") || action.includes("upload")) {
    return {
      label: formatAction(action),
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400",
    };
  }
  if (
    action.includes("update") ||
    action.includes("toggle") ||
    action.includes("change")
  ) {
    return {
      label: formatAction(action),
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400",
    };
  }
  if (action.includes("delete") || action.includes("remove")) {
    return {
      label: formatAction(action),
      className:
        "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400",
    };
  }
  return {
    label: formatAction(action),
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400",
  };
}

const LINKABLE_RESOURCES = new Set(["Events", "Organizations", "Campaigns"]);

function resourcePath(resource: string): string {
  const map: Record<string, string> = {
    Events: "events",
    Organizations: "organizations",
    Campaigns: "campaigns",
  };
  return map[resource] ?? resource.toLowerCase();
}

export function ChangeTable({
  rows,
  total,
  page,
  pageSize,
  isLoading,
  onPageChange,
  onPageSizeChange,
  onRowClick,
}: ChangeTableProps) {
  const pageCount = Math.ceil(total / pageSize);
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const columns = useMemo<ColumnDef<ChangeRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Timestamp",
        cell: ({ row }) => {
          const date = row.original.createdAt;
          return (
            <span className="text-sm whitespace-nowrap">
              {format(date, "MMM d, yyyy HH:mm:ss")}
            </span>
          );
        },
      },
      {
        id: "user",
        header: "User",
        cell: ({ row }) => {
          const user = row.original.user;
          if (!user) {
            return (
              <span className="text-sm text-muted-foreground">System</span>
            );
          }
          return (
            <div>
              <div className="text-sm font-medium">
                {user.name ?? user.email}
              </div>
              {user.name && (
                <div className="text-xs text-muted-foreground">{user.email}</div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => {
          const { label, className } = getActionBadge(row.original.action);
          return (
            <Badge className={className} variant="outline">
              {label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "resource",
        header: "Resource",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.resource}</span>
        ),
      },
      {
        id: "resourceId",
        header: "Resource ID",
        cell: ({ row }) => {
          const { resource, resourceId } = row.original;
          if (!resourceId) {
            return <span className="text-muted-foreground text-xs">—</span>;
          }
          if (LINKABLE_RESOURCES.has(resource)) {
            return (
              <Link
                href={`/${resourcePath(resource)}/${resourceId}`}
                className="font-mono text-xs text-primary underline-offset-4 hover:underline truncate max-w-[120px] block"
                onClick={(e) => e.stopPropagation()}
              >
                {resourceId}
              </Link>
            );
          }
          return (
            <span className="font-mono text-xs text-muted-foreground truncate max-w-[120px] block">
              {resourceId}
            </span>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    state: {
      pagination: { pageIndex: page - 1, pageSize },
    },
  });

  return (
    <div className="space-y-4">
      {/* Desktop table */}
      <div className="rounded-md border hidden lg:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="text-sm text-foreground">
                    No change log entries found
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Try adjusting your filters
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <div className="lg:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-md border p-4 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="rounded-md border p-8 text-center">
            <div className="text-sm text-foreground">No Change log entries found</div>
            <div className="text-xs text-muted-foreground mt-1">
              Try adjusting your filters
            </div>
          </div>
        ) : (
          rows.map((row) => {
            const { label, className } = getActionBadge(row.action);
            return (
              <div
                key={row.id}
                className="rounded-md border p-4 space-y-2 cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick(row)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {format(row.createdAt, "MMM d, yyyy HH:mm:ss")}
                  </span>
                  <Badge className={className} variant="outline">
                    {label}
                  </Badge>
                </div>
                <div className="text-sm font-medium">
                  {row.user?.name ?? row.user?.email ?? "System"}
                </div>
                <div className="text-xs text-muted-foreground">{row.resource}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground">
          Showing {startItem} to {endItem} of {total} results
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {pageCount || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount || isLoading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export { getActionBadge };
