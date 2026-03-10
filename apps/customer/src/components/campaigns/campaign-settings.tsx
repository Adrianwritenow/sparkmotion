"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@sparkmotion/ui/button";
import { Switch } from "@sparkmotion/ui/switch";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@sparkmotion/ui/dialog";

interface CampaignSettingsProps {
  campaign: {
    id: string;
    name: string;
  };
  events: Array<{
    autoLifecycle?: boolean;
  }>;
}

export function CampaignSettings({ campaign, events }: CampaignSettingsProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);

  const allAutoLifecycle = events.length > 0 && events.every(e => e.autoLifecycle);

  const toggleAutoLifecycle = trpc.events.toggleAutoLifecycleByCampaign.useMutation({
    onSuccess: (data) => {
      utils.campaigns.byId.invalidate({ id: campaign.id });
      utils.events.list.invalidate();
      router.refresh();
      if (data.skipped && data.skipped.length > 0) {
        const skippedList = data.skipped.map((s: { name: string; reason: string }) => `${s.name}: ${s.reason}`).join("\n");
        toast.warning(`${data.updated} event${data.updated !== 1 ? "s" : ""} enabled. ${data.skipped.length} skipped:`, {
          description: skippedList,
          duration: 8000,
        });
      } else if (data.updated > 0) {
        toast.success(`Auto-lifecycle ${data.updated > 0 ? "enabled" : "disabled"} for ${data.updated} event${data.updated !== 1 ? "s" : ""}`);
      }
    },
  });

  const deleteCampaign = trpc.campaigns.delete.useMutation({
    onSuccess: () => {
      setOpen(false);
      router.push("/campaigns");
      router.refresh();
    },
  });

  return (
    <div className="space-y-6">
      {/* Auto-Lifecycle */}
      <div className="border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-1">Auto-Lifecycle</h3>
            <p className="text-sm text-muted-foreground">
              Automatically activate each event when its first window starts, and complete when the next event in the tour begins
            </p>
          </div>
          <Switch
            checked={allAutoLifecycle}
            disabled={toggleAutoLifecycle.isPending || events.length === 0}
            onCheckedChange={(checked) =>
              toggleAutoLifecycle.mutate({ campaignId: campaign.id, enabled: checked })
            }
          />
        </div>
        {events.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Add events to this campaign to enable auto-lifecycle.
          </p>
        )}
      </div>

      {/* Danger Zone */}
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
