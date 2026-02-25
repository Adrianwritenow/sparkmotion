"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  org?: { name: string } | null;
  windows?: Array<{ isActive: boolean }>;
  _count: { bands: number };
  tapCount?: number;
  engagementPercent?: number;
  campaign?: { id: string; name: string } | null;
};

interface EventListWithActionsProps {
  events: EventItem[];
  showOrg?: boolean;
  showCampaign?: boolean;
  orgName: string;
}

export function EventListWithActions({ events, showOrg, showCampaign, orgName }: EventListWithActionsProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
    if (selectedIds.size === events.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(events.map((e) => e.id)));
    }
  };

  const handleDuplicate = () => {
    if (selectedIds.size === 0) return;
    duplicateEvents.mutate({ ids: Array.from(selectedIds) });
  };

  const handleDeleteConfirm = () => {
    if (selectedIds.size === 0) return;
    deleteEvents.mutate({ ids: Array.from(selectedIds) });
  };

  return (
    <div>
      {/* Select All Row */}
      <div className="flex items-center gap-3 mb-4">
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
      </div>

      {/* Event List */}
      <EventCardList
        events={events}
        showOrg={showOrg}
        showCampaign={showCampaign}
        selectable={true}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
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
        eventNames={events.filter((e) => selectedIds.has(e.id)).map((e) => e.name)}
        orgName={orgName}
        onConfirm={handleDeleteConfirm}
        isPending={deleteEvents.isPending}
      />
    </div>
  );
}
