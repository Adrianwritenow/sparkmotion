"use client";

import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteOrgDialogProps {
  orgId: string;
  orgName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteOrgDialog({
  orgId,
  orgName,
  open,
  onOpenChange,
}: DeleteOrgDialogProps) {
  const router = useRouter();

  const deleteOrg = trpc.organizations.delete.useMutation({
    onSuccess: () => {
      toast.success(`Deleted organization ${orgName}`);
      onOpenChange(false);
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Organization</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{orgName}</span>?
            This will permanently delete the organization and all associated
            data. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteOrg.mutate({ id: orgId })}
            disabled={deleteOrg.isLoading}
          >
            {deleteOrg.isLoading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
