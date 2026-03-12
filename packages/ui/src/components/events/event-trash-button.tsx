"use client";

import { useState } from "react";
import { TrashSheet, type TrashItem } from "../trash-sheet";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface EventTrashButtonProps {
  /** Admin passes true to show who deleted each event. Default: false */
  showDeletedBy?: boolean;
}

export function EventTrashButton({ showDeletedBy = false }: EventTrashButtonProps) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: count = 0 } = trpc.events.trashCount.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: deletedEvents = [], isLoading } = trpc.events.listDeleted.useQuery(
    undefined,
    { enabled: open }
  );

  const invalidate = () => {
    utils.events.trashCount.invalidate();
    utils.events.listDeleted.invalidate();
    utils.events.list.invalidate();
  };

  const restoreMutation = trpc.events.restore.useMutation({ onSuccess: invalidate });
  const softDeleteMutation = trpc.events.delete.useMutation({ onSuccess: invalidate });
  const restoreAllMutation = trpc.events.restoreAll.useMutation({
    onSuccess: (result) => {
      invalidate();
      toast.success(`Restored ${result.restored} event${result.restored !== 1 ? "s" : ""}`);
    },
  });

  const items: TrashItem[] = deletedEvents.map((e: any) => ({
    id: e.id,
    displayName: e.name,
    deletedAt: e.deletedAt!,
    ...(showDeletedBy ? { deletedByName: e.deletedByName } : {}),
  }));

  const handleRestore = async (id: string) => {
    const event = deletedEvents.find((e: any) => e.id === id);
    await restoreMutation.mutateAsync({ id });
    toast.success(`"${event?.name}" restored`, {
      action: { label: "Undo", onClick: () => softDeleteMutation.mutate({ id }) },
    });
  };

  return (
    <TrashSheet
      label="Events"
      count={count}
      isLoading={isLoading}
      items={items}
      onRestore={handleRestore}
      onRestoreAll={() => restoreAllMutation.mutate()}
      isRestoring={restoreMutation.isPending}
      isRestoringAll={restoreAllMutation.isPending}
      showDeletedBy={showDeletedBy}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
