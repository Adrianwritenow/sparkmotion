"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, X, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { trpc } from "@/lib/trpc";
import { EventCardList } from "./event-card-list";
import { DeleteEventsDialog } from "./delete-events-dialog";

type EventItem = {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  location?: string | null;
  venueName?: string | null;
  formattedAddress?: string | null;
  city?: string | null;
  state?: string | null;
  org?: { name: string } | null;
  campaign?: { id: string; name: string } | null;
  windows?: Array<{ isActive: boolean; startTime?: Date | null }>;
  _count: { bands: number };
  tapCount?: number;
  engagementPercent?: number;
};

interface EventListWithActionsProps {
  events: EventItem[];
  showOrg?: boolean;
  showCampaign?: boolean;
  /** Customer: pass the org name for delete confirmation (admin derives it from selected events) */
  orgName?: string;
  totalCount?: number;
  campaignId?: string;
}

const EVENT_SORT_OPTIONS = [
  { value: "createdAt", label: "Creation Date" },
  { value: "startDate", label: "Start Date" },
  { value: "endDate", label: "End Date" },
];

export function EventListWithActions({ events, showOrg, showCampaign, orgName, totalCount, campaignId }: EventListWithActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectAllAcrossPages, setSelectAllAcrossPages] = useState(false);
  const [shouldFetchAllIds, setShouldFetchAllIds] = useState(false);

  const { data: allIdsData } = trpc.events.listIds.useQuery(
    {
      campaignId: searchParams.get("campaignId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    },
    { enabled: shouldFetchAllIds }
  );

  useEffect(() => {
    if (allIdsData && shouldFetchAllIds) {
      setSelectedIds(new Set(allIdsData.ids));
      setSelectAllAcrossPages(true);
      setShouldFetchAllIds(false);
    }
  }, [allIdsData, shouldFetchAllIds]);

  const duplicateEvents = trpc.events.duplicate.useMutation({
    onSuccess: () => {
      utils.events.list.invalidate();
      setSelectedIds(new Set());
      router.refresh();
    },
  });

  const deleteEvents = trpc.events.deleteMany.useMutation({
    onSuccess: () => {
      utils.events.list.invalidate();
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      router.refresh();
    },
  });

  const handleSelectionChange = (id: string) => {
    setSelectAllAcrossPages(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === events.length && !selectAllAcrossPages) {
      setSelectedIds(new Set());
    } else {
      setSelectAllAcrossPages(false);
      setSelectedIds(new Set(events.map((e) => e.id)));
    }
  };

  const handleDuplicate = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 50) {
      await duplicateEvents.mutateAsync({ ids: ids.slice(i, i + 50) });
    }
    setSelectedIds(new Set());
    setSelectAllAcrossPages(false);
    router.refresh();
  };

  const handleDeleteConfirm = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    for (let i = 0; i < ids.length; i += 50) {
      await deleteEvents.mutateAsync({ ids: ids.slice(i, i + 50) });
    }
    setSelectedIds(new Set());
    setSelectAllAcrossPages(false);
    setDeleteDialogOpen(false);
    router.refresh();
  };

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return `?${params.toString()}`;
  };

  const handleSortChange = (value: string) => {
    router.push(buildUrl({ sort: value === "startDate" ? undefined : value, page: undefined }));
  };

  const handleDirToggle = () => {
    const currentDir = searchParams.get("dir") ?? "asc";
    router.push(buildUrl({ dir: currentDir === "asc" ? "desc" : undefined, page: undefined }));
  };

  // Derive org name from selected events (admin) or use the provided prop (customer)
  const selectedEvents = events.filter((e) => selectedIds.has(e.id));
  const uniqueOrgNames = [...new Set(selectedEvents.map((e) => e.org?.name).filter((n): n is string => !!n))];
  const multiOrg = uniqueOrgNames.length > 1;
  const derivedOrgName = orgName ?? (uniqueOrgNames.length === 1 ? uniqueOrgNames[0]! : null);

  return (
    <div>
      {/* Select All + Sort Row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={events.length > 0 && selectedIds.size === events.length}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} of ${events.length} selected`
              : "Select all"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Select
            value={searchParams.get("sort") ?? "startDate"}
            onValueChange={handleSortChange}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {EVENT_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleDirToggle}
            title={searchParams.get("dir") === "desc" ? "Descending" : "Ascending"}
          >
            {searchParams.get("dir") === "desc" ? (
              <ArrowDown className="w-3.5 h-3.5" />
            ) : (
              <ArrowUp className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      {selectedIds.size === events.length && events.length > 0 && totalCount && totalCount > events.length && !selectAllAcrossPages && (
        <div className="text-sm text-center py-2 bg-muted/50 rounded-md mb-4">
          All {events.length} on this page selected.{" "}
          <button
            className="text-primary underline hover:no-underline"
            onClick={() => setShouldFetchAllIds(true)}
          >
            Select all {totalCount} matching this filter
          </button>
        </div>
      )}
      {selectAllAcrossPages && (
        <div className="text-sm text-center py-2 bg-primary/10 rounded-md mb-4">
          All {selectedIds.size} selected.{" "}
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

      {/* Event List */}
      <EventCardList
        events={events}
        showOrg={showOrg}
        showCampaign={showCampaign}
        selectable={true}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        campaignId={campaignId}
      />

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-6 z-50 flex justify-center">
          <div className="flex items-center gap-3 bg-background border border-border rounded-lg shadow-lg px-4 py-3">
            <span className="text-sm font-medium">
              {selectedIds.size} event{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <Button
              size="sm"
              onClick={handleDuplicate}
              disabled={duplicateEvents.isPending}
            >
              <Copy className="w-4 h-4 mr-2" />
              {duplicateEvents.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteEventsDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        count={selectedIds.size}
        eventNames={selectedEvents.map((e) => e.name)}
        orgName={derivedOrgName}
        multiOrg={multiOrg}
        onConfirm={handleDeleteConfirm}
        isPending={deleteEvents.isPending}
      />
    </div>
  );
}
