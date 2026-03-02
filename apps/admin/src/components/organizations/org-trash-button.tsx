"use client";

import { useState } from "react";
import { TrashSheet, type TrashItem } from "@sparkmotion/ui";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function OrgTrashButton() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: count = 0 } = trpc.organizations.trashCount.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: deletedOrgs = [], isLoading } = trpc.organizations.listDeleted.useQuery(
    undefined,
    { enabled: open }
  );

  const invalidate = () => {
    utils.organizations.trashCount.invalidate();
    utils.organizations.listDeleted.invalidate();
    utils.organizations.list.invalidate();
  };

  const restoreMutation = trpc.organizations.restore.useMutation({ onSuccess: invalidate });
  const restoreAllMutation = trpc.organizations.restoreAll.useMutation({
    onSuccess: (result) => {
      invalidate();
      toast.success(`Restored ${result.restored} organization${result.restored !== 1 ? "s" : ""}`);
      // No undo action — org restoreAll cascade-restores children; re-deleting would cascade-delete them again
    },
  });

  const items: TrashItem[] = deletedOrgs.map((o: any) => ({
    id: o.id,
    displayName: o.name,
    deletedAt: o.deletedAt!,
    deletedByName: o.deletedByName,
  }));

  const handleRestore = async (id: string) => {
    const org = deletedOrgs.find((o: any) => o.id === id);
    await restoreMutation.mutateAsync({ id });
    toast.success(`"${org?.name}" restored`);
    // No undo action — per Phase 34 decision
  };

  return (
    <TrashSheet
      label="Organizations"
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
