"use client";

import { useState, useEffect, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import { trpc } from "@/lib/trpc";
import { Check, Flag, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getColumns, BandWithTag } from "./bands-columns";
import { DeleteBandsDialog } from "./delete-bands-dialog";

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function BandsTable({ eventId }: { eventId: string }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const [detailBand, setDetailBand] = useState<BandWithTag | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tagId, setTagId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const utils = trpc.useUtils();
  const { data: tagsData } = trpc.tags.list.useQuery();
  const tags = tagsData ?? [];

  const updateBand = trpc.bands.update.useMutation({
    onSuccess: () => {
      utils.bands.list.invalidate();
      setDetailBand(null);
    },
  });

  const deleteBand = trpc.bands.delete.useMutation({
    onSuccess: () => {
      utils.bands.list.invalidate();
      setDetailBand(null);
    },
  });

  const deleteManyBands = trpc.bands.deleteMany.useMutation({
    onSuccess: () => {
      utils.bands.list.invalidate();
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
    },
  });

  const resolveBands = trpc.bands.resolve.useMutation({
    onSuccess: () => {
      utils.bands.list.invalidate();
      utils.bands.flaggedCount.invalidate();
      setSelectedIds(new Set());
    },
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Clear selection on page/search change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, debouncedSearch]);

  useEffect(() => {
    if (detailBand) {
      setName(detailBand.name ?? "");
      setEmail(detailBand.email ?? "");
      setTagId(detailBand.tag?.id ?? detailBand.tagId ?? "");
      setConfirmDelete(false);
    }
  }, [detailBand]);

  const { data, isLoading } = trpc.bands.list.useQuery({
    eventId,
    search: debouncedSearch,
    page,
    pageSize: 20,
  });

  const bands = (data?.bands ?? []) as BandWithTag[];
  const totalPages = data?.totalPages ?? 1;

  const allSelected = bands.length > 0 && bands.every((b) => selectedIds.has(b.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bands.map((b) => b.id)));
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

  const onResolve = (id: string) => resolveBands.mutate({ ids: [id] });

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
    updateBand.mutate({
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
    deleteBand.mutate({ id: detailBand.id });
  };

  const handleClose = () => {
    setDetailBand(null);
    setConfirmDelete(false);
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    deleteManyBands.mutate({ ids: Array.from(selectedIds) });
  };

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by band ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

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
                onClick={() => resolveBands.mutate({ ids: Array.from(selectedIds) })}
                disabled={resolveBands.isPending}
              >
                <Check className="w-4 h-4 mr-2" />
                Resolve
              </Button>
            )}
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
        isPending={deleteManyBands.isPending}
      />

      {/* Band Detail Dialog */}
      <Dialog open={!!detailBand} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="sm:max-w-[480px]">
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

              {/* Editable fields */}
              <div className="space-y-3 border-t pt-4">
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
                      {tags.map((tag: { id: string; title: string }) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          {tag.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(updateBand.error || deleteBand.error) && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {updateBand.error?.message || deleteBand.error?.message}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="flex-row gap-2 sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteBand.isPending}
              >
                {deleteBand.isPending ? "Deleting..." : confirmDelete ? "Confirm?" : "Delete"}
              </Button>
              {detailBand?.flagged && (
                <Button
                  variant="outline"
                  onClick={() => {
                    resolveBands.mutate({ ids: [detailBand.id] }, {
                      onSuccess: () => handleClose(),
                    });
                  }}
                  disabled={resolveBands.isPending}
                >
                  {resolveBands.isPending ? "Resolving..." : "Resolve"}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateBand.isPending}>
                {updateBand.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
