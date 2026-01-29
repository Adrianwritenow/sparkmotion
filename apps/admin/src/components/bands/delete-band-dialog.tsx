"use client";

import { useState } from "react";
import { Band } from "@sparkmotion/database";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DeleteBandDialog({ band }: { band: Band }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const deleteBand = trpc.bands.delete.useMutation({
    onSuccess: () => {
      utils.bands.list.invalidate();
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Band</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete band <strong>{band.bandId}</strong>? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => deleteBand.mutate({ id: band.id })} disabled={deleteBand.isPending}>
            {deleteBand.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
