"use client";

import { useState } from "react";
import { TrashSheet, type TrashItem } from "../..";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface BandTrashButtonProps {
  /** Admin: scope to specific org */
  orgId?: string;
  eventId?: string;
  /** Admin: show who deleted the item. Defaults to false. */
  showDeletedBy?: boolean;
}

export function BandTrashButton({ orgId, eventId, showDeletedBy = false }: BandTrashButtonProps = {}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: count = 0 } = trpc.bands.trashCount.useQuery(
    eventId ? { eventId } : undefined,
    { refetchOnWindowFocus: false }
  );

  const { data: deletedBands = [], isLoading } = trpc.bands.listDeleted.useQuery(
    orgId || eventId ? { orgId, eventId } : undefined,
    { enabled: open }
  );

  const invalidateAll = () => {
    utils.bands.trashCount.invalidate();
    utils.bands.listDeleted.invalidate();
    utils.bands.listAll.invalidate();
    if (eventId) utils.bands.list.invalidate();
  };

  const restoreMutation = trpc.bands.restore.useMutation({ onSuccess: invalidateAll });
  const softDeleteMutation = trpc.bands.delete.useMutation({ onSuccess: invalidateAll });
  const restoreAllMutation = trpc.bands.restoreAll.useMutation({
    onSuccess: (result) => {
      invalidateAll();
      const total = result.restored + result.skipped;
      if (result.skipped > 0) {
        toast.warning(
          `Restored ${result.restored} of ${total} bands. ${result.skipped} skipped — band IDs already exist in their event.`
        );
      } else {
        toast.success(`Restored ${result.restored} band${result.restored !== 1 ? "s" : ""}`);
      }
    },
  });

  const items: TrashItem[] = deletedBands.map((b: any) => ({
    id: b.id,
    displayName: b.bandId,
    deletedAt: b.deletedAt!,
    ...(showDeletedBy ? { deletedByName: b.deletedByName } : {}),
    subtitle: b.event?.name,
  }));

  const handleRestore = async (id: string) => {
    const band = deletedBands.find((b: any) => b.id === id);
    const result = await restoreMutation.mutateAsync({ id });
    if (result.skipped === 1) {
      toast.warning(`Band "${band?.bandId}" skipped — ID already exists in this event`);
    } else {
      toast.success(`Band "${band?.bandId}" restored`, {
        action: { label: "Undo", onClick: () => softDeleteMutation.mutate({ id }) },
      });
    }
  };

  return (
    <TrashSheet
      label="Bands"
      count={count}
      isLoading={isLoading}
      items={items}
      onRestore={handleRestore}
      onRestoreAll={() => restoreAllMutation.mutate(eventId ? { eventId } : undefined)}
      isRestoring={restoreMutation.isPending}
      isRestoringAll={restoreAllMutation.isPending}
      showDeletedBy={showDeletedBy}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
