"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReassignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedBandIds: string[];
  onSuccess: () => void;
}

export function ReassignDialog({
  open,
  onOpenChange,
  selectedBandIds,
  onSuccess,
}: ReassignDialogProps) {
  const [targetEventId, setTargetEventId] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [filling, setFilling] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(3);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const utils = trpc.useUtils();

  // Fetch events for customer's org (ACTIVE and DRAFT only)
  const { data: eventsData } = trpc.events.list.useQuery(undefined, {
    enabled: open,
  });

  const events = (eventsData ?? []).filter(
    (e: any) => e.status === "ACTIVE" || e.status === "DRAFT"
  );

  const bulkReassign = trpc.bands.bulkReassign.useMutation({
    onSuccess: (data) => {
      setSuccessMsg(`${data.updated} band${data.updated !== 1 ? "s" : ""} reassigned`);
      utils.bands.listAll.invalidate();
      utils.bands.activityFeed.invalidate();
      onSuccess();
      setTimeout(() => {
        onOpenChange(false);
        setSuccessMsg("");
        setTargetEventId("");
      }, 1500);
    },
  });

  const clearTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleReassign = () => {
    if (!targetEventId || selectedBandIds.length === 0) return;
    bulkReassign.mutate({
      bandIds: selectedBandIds,
      targetEventId,
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (bulkReassign.isPending) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFilling(true);
    setSecondsLeft(3);
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= 3000) {
        clearTimer();
        setFilling(false);
        handleReassign();
      } else {
        setSecondsLeft(Math.ceil((3000 - elapsed) / 1000));
      }
    }, 250);
  };

  const handlePointerUp = () => {
    clearTimer();
    setFilling(false);
    setSecondsLeft(3);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign Bands</DialogTitle>
          <DialogDescription>
            Reassign {selectedBandIds.length} band{selectedBandIds.length !== 1 ? "s" : ""} to a
            different event.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Target Event
            </label>
            <Select value={targetEventId} onValueChange={setTargetEventId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an event..." />
              </SelectTrigger>
              <SelectContent>
                {events.map((event: any) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.name} ({event.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950">
            <p className="text-sm text-orange-800 dark:text-orange-300">
              Warning: Reassigning bands will permanently delete their tap history and reset tap counts.
            </p>
          </div>

          {bulkReassign.error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {bulkReassign.error.message}
            </p>
          )}

          {successMsg && (
            <p className="text-sm text-green-600 dark:text-green-400">
              {successMsg}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <button
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            disabled={!targetEventId || bulkReassign.isPending}
            className="relative inline-flex items-center justify-center h-10 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground overflow-hidden select-none touch-none disabled:opacity-50 disabled:pointer-events-none"
          >
            <div
              className="absolute inset-0 bg-orange-600/40"
              style={{
                width: filling ? "100%" : "0%",
                transition: filling ? "width 3s linear" : "none",
              }}
            />
            <span className="relative z-10">
              {filling ? `${secondsLeft}s` : "Hold to Reassign (3s)"}
            </span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
