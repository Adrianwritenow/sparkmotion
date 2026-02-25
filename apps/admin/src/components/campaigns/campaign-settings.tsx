"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CampaignSettingsProps {
  campaign: { id: string; name: string };
}

export function CampaignSettings({ campaign }: CampaignSettingsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const deleteCampaign = trpc.campaigns.delete.useMutation({
    onSuccess: () => {
      setOpen(false);
      router.push("/campaigns");
      router.refresh();
    },
  });

  return (
    <div className="space-y-6">
      <div className="border border-destructive/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-destructive mb-2">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Permanently delete this campaign. Events in this campaign will not be deleted but will be disassociated.
        </p>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete Campaign
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Campaign</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{campaign.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteCampaign.mutate({ id: campaign.id })}
              disabled={deleteCampaign.isPending}
            >
              {deleteCampaign.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
