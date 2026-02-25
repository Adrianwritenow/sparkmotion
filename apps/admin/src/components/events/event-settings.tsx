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

interface EventSettingsProps {
  event: { id: string; name: string };
}

export function EventSettings({ event }: EventSettingsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const deleteEvent = trpc.events.delete.useMutation({
    onSuccess: () => {
      setOpen(false);
      router.push("/events");
      router.refresh();
    },
  });

  return (
    <div className="space-y-6">
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
