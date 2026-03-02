"use client";

import { useState } from "react";
import { TrashSheet, type TrashItem } from "@sparkmotion/ui";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function CampaignTrashButton() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: count = 0 } = trpc.campaigns.trashCount.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: deletedCampaigns = [], isLoading } = trpc.campaigns.listDeleted.useQuery(
    undefined,
    { enabled: open }
  );

  const invalidate = () => {
    utils.campaigns.trashCount.invalidate();
    utils.campaigns.listDeleted.invalidate();
    utils.campaigns.list.invalidate();
  };

  const restoreMutation = trpc.campaigns.restore.useMutation({ onSuccess: invalidate });
  const softDeleteMutation = trpc.campaigns.delete.useMutation({ onSuccess: invalidate });
  const restoreAllMutation = trpc.campaigns.restoreAll.useMutation({
    onSuccess: (result) => {
      invalidate();
      toast.success(`Restored ${result.restored} campaign${result.restored !== 1 ? "s" : ""}`);
    },
  });

  const items: TrashItem[] = deletedCampaigns.map((c: any) => ({
    id: c.id,
    displayName: c.name,
    deletedAt: c.deletedAt!,
    deletedByName: c.deletedByName,
  }));

  const handleRestore = async (id: string) => {
    const campaign = deletedCampaigns.find((c: any) => c.id === id);
    await restoreMutation.mutateAsync({ id });
    toast.success(`"${campaign?.name}" restored`, {
      action: { label: "Undo", onClick: () => softDeleteMutation.mutate({ id }) },
    });
  };

  return (
    <TrashSheet
      label="Campaigns"
      count={count}
      isLoading={isLoading}
      items={items}
      onRestore={handleRestore}
      onRestoreAll={() => restoreAllMutation.mutate()}
      isRestoring={restoreMutation.isPending}
      isRestoringAll={restoreAllMutation.isPending}
      showDeletedBy={true}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
