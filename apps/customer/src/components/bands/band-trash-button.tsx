"use client";

import { useState } from "react";
import { Trash2, RotateCcw, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { differenceInDays, format } from "date-fns";

function daysRemaining(deletedAt: Date | string) {
  return Math.max(0, 30 - differenceInDays(new Date(), new Date(deletedAt)));
}

export function BandTrashButton() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: count = 0 } = trpc.bands.trashCount.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: deletedBands = [], isLoading } = trpc.bands.listDeleted.useQuery(
    undefined,
    { enabled: open }
  );

  const restoreMutation = trpc.bands.restore.useMutation({
    onSuccess: () => {
      utils.bands.trashCount.invalidate();
      utils.bands.listDeleted.invalidate();
      utils.bands.listAll.invalidate();
    },
  });

  const softDeleteMutation = trpc.bands.delete.useMutation({
    onSuccess: () => {
      utils.bands.trashCount.invalidate();
      utils.bands.listDeleted.invalidate();
      utils.bands.listAll.invalidate();
    },
  });

  const restoreAllMutation = trpc.bands.restoreAll.useMutation({
    onSuccess: (result) => {
      utils.bands.trashCount.invalidate();
      utils.bands.listDeleted.invalidate();
      utils.bands.listAll.invalidate();
      const total = result.restored + result.skipped;
      if (result.skipped > 0) {
        toast.warning(
          `Restored ${result.restored} of ${total} bands. ${result.skipped} skipped — band IDs already exist in their event.`
        );
      } else {
        toast.success(`Restored ${result.restored} band${result.restored !== 1 ? "s" : ""}`);
      }
    },
  });

  const handleRestore = async (id: string, bandId: string) => {
    const result = await restoreMutation.mutateAsync({ id });
    if (result.skipped === 1) {
      toast.warning(`Band "${bandId}" skipped — ID already exists in this event`);
    } else {
      toast.success(`Band "${bandId}" restored`, {
        action: {
          label: "Undo",
          onClick: () => softDeleteMutation.mutate({ id }),
        },
      });
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-md hover:bg-muted transition-colors"
        aria-label="View deleted bands"
        title="Deleted bands"
      >
        <Trash2 className="h-5 w-5 text-muted-foreground" />
        {count > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px]"
          >
            {count > 99 ? "99+" : count}
          </Badge>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader className="pb-4 border-b shrink-0">
            <SheetTitle>Deleted Bands</SheetTitle>
            <SheetDescription>
              Items are permanently removed after 30 days. Next cleanup runs daily at 3 AM UTC.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {deletedBands.length > 0 && (
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restoreAllMutation.mutate()}
                  disabled={restoreAllMutation.isPending}
                  className="w-full"
                >
                  {restoreAllMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  )}
                  Restore All ({deletedBands.length})
                </Button>
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : deletedBands.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Trash2 className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No deleted bands</p>
              </div>
            ) : (
              <div className="space-y-2">
                {deletedBands.map((band) => {
                  const remaining = daysRemaining(band.deletedAt!);
                  return (
                    <div
                      key={band.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium font-mono truncate">{band.bandId}</p>
                        {band.event && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {band.event.name}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(band.deletedAt!), "MMM d, yyyy")}
                        </p>
                        <p
                          className={`text-xs mt-0.5 ${
                            remaining <= 7 ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          Permanently removed in {remaining} day{remaining !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(band.id, band.bandId)}
                        disabled={restoreMutation.isPending}
                        className="shrink-0"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
