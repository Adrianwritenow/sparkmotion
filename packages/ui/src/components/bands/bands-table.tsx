"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { ArrowRightLeft, Check, Flag, Trash2, X } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { getColumns, type BandWithTag } from "./bands-columns";
import { DeleteBandsDialog } from "./delete-bands-dialog";

const MODE_LABELS: Record<string, string> = {
  PRE: "Pre-Event",
  LIVE: "Live Event",
  POST: "Post-Event",
  FALLBACK: "Fallback",
  DEFAULT: "Default",
};

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export interface BandsTableData {
  bands: BandWithTag[];
  totalPages: number;
  totalCount: number;
}

export interface BandLogRow {
  id: string;
  window?: { title?: string | null } | null;
  modeServed: string;
  tappedAt: string | Date;
}

export interface BandsTableTag {
  id: string;
  title: string;
}

interface BandsTableBaseProps {
  data?: BandsTableData | null;
  isLoading?: boolean;
  tags: BandsTableTag[];
  tapLogs?: BandLogRow[] | null;
  tapLogsLoading?: boolean;
  detailBand: BandWithTag | null;
  onDetailBandChange: (band: BandWithTag | null) => void;
  onUpdateBand: (payload: { id: string; name: string | null; email: string | null; tagId: string | null }) => void;
  onDeleteBand: (id: string) => void;
  onDeleteManyBands: (ids: string[]) => Promise<void>;
  onResolveBands: (ids: string[]) => Promise<void> | void;
  onFetchAllIds: (search?: string) => Promise<string[]>;
  renderReassignDialog: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedBandIds: string[];
    onSuccess: () => void;
  }) => React.ReactNode;
  isUpdating?: boolean;
  isDeleting?: boolean;
  isDeletingMany?: boolean;
  isResolving?: boolean;
  updateError?: string | null;
  deleteError?: string | null;
  onSearchChange?: (search: string) => void;
  onPageChange?: (page: number) => void;
  onReassignSuccess?: () => void;
}

export function BandsTableBase({
  data,
  isLoading,
  tags,
  tapLogs,
  tapLogsLoading,
  detailBand,
  onDetailBandChange,
  onUpdateBand,
  onDeleteBand,
  onDeleteManyBands,
  onResolveBands,
  onFetchAllIds,
  renderReassignDialog,
  isUpdating,
  isDeleting,
  isDeletingMany,
  isResolving,
  updateError,
  deleteError,
  onSearchChange,
  onPageChange,
  onReassignSuccess,
}: BandsTableBaseProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tagId, setTagId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllAcrossPages, setSelectAllAcrossPages] = useState(false);
  const [shouldFetchAllIds, setShouldFetchAllIds] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  useEffect(() => {
    onSearchChange?.(debouncedSearch);
    setPage(1);
  }, [debouncedSearch, onSearchChange]);

  useEffect(() => {
    onPageChange?.(page);
  }, [page, onPageChange]);

  useEffect(() => {
    if (detailBand) {
      setName(detailBand.name ?? "");
      setEmail(detailBand.email ?? "");
      setTagId(detailBand.tag?.id ?? detailBand.tagId ?? "");
      setConfirmDelete(false);
    }
  }, [detailBand]);

  useEffect(() => {
    if (!selectAllAcrossPages) {
      setSelectedIds(new Set());
    }
  }, [page, debouncedSearch, selectAllAcrossPages]);

  useEffect(() => {
    if (!shouldFetchAllIds) return;
    const run = async () => {
      try {
        const ids = await onFetchAllIds(debouncedSearch || undefined);
        setSelectedIds(new Set(ids));
        setSelectAllAcrossPages(true);
      } finally {
        setShouldFetchAllIds(false);
      }
    };
    run();
  }, [shouldFetchAllIds, debouncedSearch, onFetchAllIds]);

  const bands = data?.bands ?? [];
  const totalPages = data?.totalPages ?? 1;
  const totalCount = data?.totalCount ?? 0;

  const allSelected = bands.length > 0 && bands.every((b) => selectedIds.has(b.id));

  const toggleAll = () => {
    setSelectAllAcrossPages(false);
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bands.map((b) => b.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectAllAcrossPages(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onResolve = (id: string) => {
    onResolveBands([id]);
  };

  const columns = useMemo(
    () => getColumns({ selectedIds, allSelected, toggleAll, toggleOne, onResolve }),
    [selectedIds, allSelected, bands]
  );

  const table = useReactTable({
    data: bands,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleSave = () => {
    if (!detailBand) return;
    onUpdateBand({
      id: detailBand.id,
      name: name || null,
      email: email || null,
      tagId: tagId && tagId !== "none" ? tagId : null,
    });
  };

  const handleDelete = () => {
    if (!detailBand) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDeleteBand(detailBand.id);
  };

  const handleClose = () => {
    onDetailBandChange(null);
    setConfirmDelete(false);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 500) {
      await onDeleteManyBands(ids.slice(i, i + 500));
    }
    setSelectedIds(new Set());
    setSelectAllAcrossPages(false);
    setDeleteDialogOpen(false);
  };

  const handleReassignSuccess = () => {
    setSelectedIds(new Set());
    setSelectAllAcrossPages(false);
    onReassignSuccess?.();
  };

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by band ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {allSelected && totalCount > bands.length && !selectAllAcrossPages && (
        <div className="text-sm text-center py-2 bg-muted/50 rounded-md">
          All {bands.length} on this page selected.{" "}
          <button
            className="text-primary underline hover:no-underline"
            onClick={() => setShouldFetchAllIds(true)}
          >
            Select all {totalCount.toLocaleString()} matching this filter
          </button>
        </div>
      )}
      {selectAllAcrossPages && (
        <div className="text-sm text-center py-2 bg-primary/10 rounded-md">
          All {selectedIds.size.toLocaleString()} selected.{" "}
          <button
            className="text-primary underline hover:no-underline"
            onClick={() => {
              setSelectAllAcrossPages(false);
              setSelectedIds(new Set());
            }}
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
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
                  onClick={() => onDetailBandChange(row.original)}
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
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

      {/* Floating action bar */}
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
                onClick={() => onResolveBands(Array.from(selectedIds))}
                disabled={isResolving}
              >
                <Check className="w-4 h-4 mr-2" />
                Resolve
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReassignOpen(true)}
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Reassign
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk delete dialog */}
      <DeleteBandsDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        count={selectedIds.size}
        onConfirm={handleBulkDelete}
        isPending={!!isDeletingMany}
      />

      {/* Reassign dialog */}
      {renderReassignDialog({
        open: reassignOpen,
        onOpenChange: setReassignOpen,
        selectedBandIds: Array.from(selectedIds),
        onSuccess: handleReassignSuccess,
      })}

      {/* Band Detail Dialog */}
      <Dialog open={!!detailBand} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="font-mono">{detailBand?.bandId}</DialogTitle>
          </DialogHeader>

          {detailBand && (
            <div className="space-y-5">
              {/* Read-only info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Tap Count</span>
                  <p className="font-medium mt-0.5">{detailBand.tapCount.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Auto-assigned</span>
                  <p className="font-medium mt-0.5">{detailBand.autoAssigned ? "Yes" : "No"}</p>
                </div>
                {detailBand.autoAssigned && (
                  <div>
                    <span className="text-muted-foreground">Assign Distance</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-medium">
                        {detailBand.autoAssignDistance != null
                          ? `${detailBand.autoAssignDistance.toFixed(1)} mi`
                          : "Unknown"}
                      </span>
                      {detailBand.flagged && (
                        <Flag className="w-4 h-4 fill-red-500 text-red-500" />
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">First Tap</span>
                  <p className="font-medium mt-0.5">
                    {detailBand.firstTapAt ? new Date(detailBand.firstTapAt).toLocaleString() : "Never"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Tap</span>
                  <p className="font-medium mt-0.5">
                    {detailBand.lastTapAt ? new Date(detailBand.lastTapAt).toLocaleString() : "Never"}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="metadata">
                <TabsList className="w-full">
                  <TabsTrigger value="metadata" className="flex-1">Metadata</TabsTrigger>
                  <TabsTrigger value="taplog" className="flex-1">Tap Log</TabsTrigger>
                </TabsList>

                <TabsContent value="metadata" className="mt-4">
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Name</label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Registrant name"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Email</label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Registrant email"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Tag</label>
                      <Select value={tagId} onValueChange={setTagId}>
                        <SelectTrigger>
                          <SelectValue placeholder="No tag" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No tag</SelectItem>
                          {tags.map((tag) => (
                            <SelectItem key={tag.id} value={tag.id}>
                              {tag.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {(updateError || deleteError) && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-3">
                      {updateError || deleteError}
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="taplog" className="mt-4">
                  {tapLogsLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : !tapLogs?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No taps recorded
                    </p>
                  ) : (
                    <div className="max-h-[300px] overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Window</TableHead>
                            <TableHead>Date & Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tapLogs.map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="text-sm">
                                {log.window?.title ?? MODE_LABELS[log.modeServed] ?? log.modeServed}
                              </TableCell>
                              <TableCell className="text-sm">
                                {new Date(log.tappedAt).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter className="flex-row gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : confirmDelete ? "Confirm?" : "Delete"}
              </Button>
              {detailBand?.flagged && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const res = onResolveBands([detailBand.id]);
                      if (res && typeof (res as Promise<void>).then === "function") {
                        await res;
                      }
                      handleClose();
                    } catch {
                      // keep dialog open on failure
                    }
                  }}
                  disabled={isResolving}
                >
                  {isResolving ? "Resolving..." : "Resolve"}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isUpdating}>
                {isUpdating ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
