"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@sparkmotion/ui/button";
import { Switch } from "@sparkmotion/ui/switch";
import { Label } from "@sparkmotion/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@sparkmotion/ui/dialog";

interface EventSettingsProps {
  event: { id: string; name: string; assignOnFlag: boolean };
}

export function EventSettings({ event }: EventSettingsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [assignOnFlag, setAssignOnFlag] = useState(event.assignOnFlag);
  const updateEvent = trpc.events.update.useMutation({
    onSuccess: () => router.refresh(),
  });
  const deleteEvent = trpc.events.delete.useMutation({
    onSuccess: () => {
      setOpen(false);
      router.push("/events");
      router.refresh();
    },
  });

  const handleAssignOnFlagChange = (checked: boolean) => {
    setAssignOnFlag(checked);
    updateEvent.mutate({ id: event.id, assignOnFlag: checked });
  };

  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="assign-on-flag" className="text-base font-semibold">
              Assign on Flag
            </Label>
            <p className="text-sm text-muted-foreground">
              When enabled, flagged bands will use this event&apos;s windows and count toward analytics instead of redirecting to the organization website.
            </p>
          </div>
          <Switch
            id="assign-on-flag"
            checked={assignOnFlag}
            onCheckedChange={handleAssignOnFlagChange}
            disabled={updateEvent.isPending}
          />
        </div>
      </div>

      <div className="border border-destructive/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-destructive mb-2">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Permanently delete this event and all associated data including bands, windows, and tap logs.
        </p>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete Event
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{event.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteEvent.mutate({ id: event.id })}
              disabled={deleteEvent.isPending}
            >
              {deleteEvent.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
