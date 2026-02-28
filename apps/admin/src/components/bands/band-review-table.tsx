"use client";

import { useState, useEffect, useMemo } from "react";
import {
  subHours,
  subDays,
} from "date-fns";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Flag, Globe, ArrowRightLeft, X } from "lucide-react";
import { BandTrashButton } from "./band-trash-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TagBadge } from "./tag-badge";
import { ReassignDialog } from "./reassign-dialog";
import { BandDetailDialog } from "./band-detail-dialog";

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface BandRow {
  id: string;
  bandId: string;
  name?: string | null;
  email?: string | null;
  tapCount: number;
  firstTapAt?: string | null;
  lastTapAt: string | null;
  autoAssigned: boolean;
  autoAssignDistance?: number | null;
  flagged: boolean;
  event: { id: string; name: string; status: string };
  tag?: { id: string; title: string } | null;
  tagId?: string | null;
}

interface BandReviewTableProps {
  orgs: Array<{ id: string; name: string }>;
}

export function BandReviewTable({ orgs }: BandReviewTableProps) {
  const [orgId, setOrgId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [timePreset, setTimePreset] = useState<"hour" | "day" | "week">("day");
  const [tagId, setTagId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [detailBand, setDetailBand] = useState<BandRow | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, orgId, flaggedOnly, timePreset, tagId]);

  // Clear selection on filter/page change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, orgId, debouncedSearch, flaggedOnly, timePreset, tagId]);

  // Tags dropdown
  const { data: tagsData } = trpc.tags.list.useQuery();
  const tags = tagsData ?? [];

  const { activityFrom, activityTo } = useMemo(() => {
    const now = new Date();
    if (timePreset === "hour") {
      return { activityFrom: subHours(now, 1), activityTo: now };
    }
    if (timePreset === "day") {
      return { activityFrom: subHours(now, 24), activityTo: now };
    }
    return { activityFrom: subDays(now, 7), activityTo: now };
  }, [timePreset]);

  const { data, isLoading } = trpc.bands.listAll.useQuery({
    orgId: orgId && orgId !== "all" ? orgId : undefined,
    search: debouncedSearch || undefined,
    flaggedOnly: flaggedOnly || undefined,
    activityFrom,
    activityTo,
    tagId: tagId && tagId !== "all" ? tagId : undefined,
    page,
    pageSize: 20,
  });

  const utils = trpc.useUtils();
  const resolveBands = trpc.bands.resolve.useMutation({
    onSuccess: () => {
      utils.bands.listAll.invalidate();
      utils.bands.flaggedCount.invalidate();
      setSelectedIds(new Set());
    },
  });

  const bands: BandRow[] = (data?.bands ?? []) as any;
  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const allPageIds = useMemo(() => new Set(bands.map((b) => b.id)), [bands]);
  const allSelected = bands.length > 0 && bands.every((b) => selectedIds.has(b.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPageIds));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const columns: ColumnDef<BandRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={() => toggleOne(row.original.id)}
            aria-label={`Select ${row.original.bandId}`}
          />
        ),
        size: 40,
      },
      {
        accessorKey: "bandId",
        header: "Band ID",
        cell: ({ row }) => {
          return (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{row.original.bandId}</span>
              {row.original.autoAssigned && (
                row.original.flagged ? (
                  <Flag className="w-4 h-4 fill-red-500 text-red-500" />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                )
              )}
            </div>
          );
        },
      },
      {
        id: "event",
        header: "Event",
        cell: ({ row }) => row.original.event.name,
      },
      {
        id: "tag",
        header: "Tag",
        cell: ({ row }) => <TagBadge tag={(row.original as BandRow).tag} />,
      },
      {
        accessorKey: "tapCount",
        header: "Taps",
        cell: ({ row }) => row.original.tapCount.toLocaleString(),
      },
      {
        accessorKey: "lastTapAt",
        header: "Last Activity",
        cell: ({ row }) =>
          row.original.lastTapAt
            ? new Date(row.original.lastTapAt).toLocaleString()
            : "Never",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.flagged ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                resolveBands.mutate({ ids: [row.original.id] });
              }}
            >
              Resolve
            </Button>
          ) : null,
      },
    ],
    [selectedIds, allSelected]
  );

  const table = useReactTable({
    data: bands,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const startRow = (page - 1) * 20 + 1;
  const endRow = Math.min(page * 20, totalCount);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Organizations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Organizations</SelectItem>
            {orgs.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Search band ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[200px]"
        />

        <Select value={tagId} onValueChange={setTagId}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {tags.map((tag: { id: string; title: string }) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 rounded-md border border-border p-1">
          {(
            [
              { value: "hour", label: "Hour" },
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
            ] as const
          ).map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              variant={timePreset === value ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setTimePreset(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="flagged-only"
            checked={flaggedOnly}
            onCheckedChange={setFlaggedOnly}
          />
          <label htmlFor="flagged-only" className="text-sm text-muted-foreground cursor-pointer">
            Flagged
          </label>
        </div>

        <BandTrashButton orgId={orgId && orgId !== "all" ? orgId : undefined} />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setDetailBand(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      onClick={cell.column.id === "select" || cell.column.id === "actions" ? (e) => e.stopPropagation() : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No bands found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalCount > 0
            ? `Showing ${startRow}-${endRow} of ${totalCount.toLocaleString()}`
            : "No results"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-6 z-50 flex justify-center">
          <div className="flex items-center gap-3 bg-background border border-border rounded-lg shadow-lg px-4 py-3">
            <span className="text-sm font-medium">
              {selectedIds.size} band{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            {bands.some((b) => selectedIds.has(b.id) && b.flagged) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolveBands.mutate({ ids: Array.from(selectedIds) })}
                disabled={resolveBands.isPending}
              >
                <Check className="w-4 h-4 mr-2" />
                Resolve
              </Button>
            )}
            <Button size="sm" onClick={() => setReassignOpen(true)}>
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Reassign
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Reassign Dialog */}
      <ReassignDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        selectedBandIds={Array.from(selectedIds)}
        orgId={orgId}
        onSuccess={() => setSelectedIds(new Set())}
      />

      {/* Band Detail Dialog */}
      <BandDetailDialog
        band={detailBand}
        onClose={() => setDetailBand(null)}
        onReassign={(bandId) => {
          setDetailBand(null);
          setSelectedIds(new Set([bandId]));
          setReassignOpen(true);
        }}
      />
    </div>
  );
}
