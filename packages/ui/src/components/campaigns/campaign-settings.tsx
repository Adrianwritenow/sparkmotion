"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";

interface CampaignSettingsBaseProps {
  campaignName: string;
  eventsCount: number;
  allAutoLifecycle: boolean;
  onToggleAutoLifecycle: (checked: boolean) => void;
  isToggling?: boolean;
  onDelete: () => void;
  isDeleting?: boolean;
}

export function CampaignSettingsBase({
  campaignName,
  eventsCount,
  allAutoLifecycle,
  onToggleAutoLifecycle,
  isToggling,
  onDelete,
  isDeleting,
}: CampaignSettingsBaseProps) {
  const [open, setOpen] = useState(false);

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
            disabled={!!isToggling || eventsCount === 0}
            onCheckedChange={onToggleAutoLifecycle}
          />
        </div>
        {eventsCount === 0 && (
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
              Are you sure you want to delete <strong>{campaignName}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
