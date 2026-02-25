"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TriangleAlert, Loader2 } from "lucide-react";

interface DeleteEventsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  eventNames: string[];
  orgName: string | null;
  multiOrg: boolean;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteEventsDialog({
  open,
  onOpenChange,
  count,
  eventNames,
  orgName,
  multiOrg,
  onConfirm,
  isPending,
}: DeleteEventsDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [filling, setFilling] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5);

  const nameMatches =
    !multiOrg &&
    orgName != null &&
    confirmText.toLowerCase() === orgName.toLowerCase();

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleClose = useCallback(
    (value: boolean) => {
      if (!value) {
        setConfirmText("");
        setFilling(false);
        setSecondsLeft(5);
        clearTimer();
      }
      onOpenChange(value);
    },
    [onOpenChange, clearTimer],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!nameMatches || isPending) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setFilling(true);
    setSecondsLeft(5);
    const start = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= 5000) {
        clearTimer();
        setFilling(false);
        onConfirm();
      } else {
        setSecondsLeft(Math.ceil((5000 - elapsed) / 1000));
      }
    }, 250);
  };

  const handlePointerUp = () => {
    setFilling(false);
    setSecondsLeft(5);
    clearTimer();
  };

  useEffect(() => clearTimer, [clearTimer]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {count} Event{count !== 1 ? "s" : ""}</DialogTitle>
          <DialogDescription>
            You are about to permanently delete {count} event{count !== 1 ? "s" : ""}. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {eventNames.length > 0 && (
          <ul className="max-h-40 overflow-y-auto space-y-1 text-sm text-muted-foreground">
            {eventNames.map((name, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                {name}
              </li>
            ))}
          </ul>
        )}

        {multiOrg && (
          <div className="flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950">
            <TriangleAlert className="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              Selected events belong to multiple organizations. Please select events from a single organization.
            </p>
          </div>
        )}

        {!multiOrg && orgName && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Type <span className="font-bold">{orgName}</span> to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={orgName}
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          {/* Hold-to-delete button */}
          <button
            type="button"
            disabled={!nameMatches || isPending}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="relative inline-flex h-9 min-w-[180px] items-center justify-center overflow-hidden rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground select-none touch-none disabled:pointer-events-none disabled:opacity-50"
          >
            <div
              className="absolute inset-0 bg-red-900/40"
              style={{
                width: filling ? "100%" : "0%",
                transition: filling ? "width 5s linear" : "none",
              }}
            />
            <span className="relative z-10 flex items-center gap-2">
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : filling ? (
                `${secondsLeft}s`
              ) : (
                "Hold to Delete (5s)"
              )}
            </span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
