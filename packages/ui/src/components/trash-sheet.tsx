"use client";

import { useState } from "react";
import { Trash2, RotateCcw, Loader2 } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";

export interface TrashItem {
  id: string;
  displayName: string;
  deletedAt: Date | string;
  deletedByName?: string | null;
  subtitle?: string;
  /** Days until permanent deletion (overrides computed value if provided) */
  daysRemaining?: number;
}

export interface TrashSheetProps {
  /** Entity label e.g. "Events", "Campaigns", "Bands", "Organizations" */
  label: string;
  /** Count shown on the trigger badge */
  count: number;
  /** Whether the list is loading */
  isLoading: boolean;
  /** Mapped trash items */
  items: TrashItem[];
  /** Called when user clicks restore on a single item */
  onRestore: (id: string) => void;
  /** Called when user clicks restore all */
  onRestoreAll: () => void;
  /** Whether any single restore is in progress */
  isRestoring: boolean;
  /** Whether restoreAll is in progress */
  isRestoringAll: boolean;
  /** Admin shows deleted-by attribution; customer hides it */
  showDeletedBy?: boolean;
  /** Controls open state externally */
  open: boolean;
  /** Called when open state changes */
  onOpenChange: (open: boolean) => void;
}

function daysRemaining(deletedAt: Date | string): number {
  return Math.max(0, 30 - differenceInDays(new Date(), new Date(deletedAt)));
}

export function TrashSheet({
  label,
  count,
  isLoading,
  items,
  onRestore,
  onRestoreAll,
  isRestoring,
  isRestoringAll,
  showDeletedBy = false,
  open,
  onOpenChange,
}: TrashSheetProps) {
  return (
    <>
      <button
        onClick={() => onOpenChange(true)}
        className="relative p-2 rounded-md hover:bg-muted transition-colors"
        aria-label={`View deleted ${label.toLowerCase()}`}
        title={`Deleted ${label.toLowerCase()}`}
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

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader className="pb-4 border-b shrink-0">
            <SheetTitle>Deleted {label}</SheetTitle>
            <SheetDescription>
              Items are permanently removed after 30 days. Next cleanup runs daily at 3 AM UTC.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {items.length > 0 && (
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRestoreAll}
                  disabled={isRestoringAll}
                  className="w-full"
                >
                  {isRestoringAll ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  )}
                  Restore All ({items.length})
                </Button>
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Trash2 className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No deleted {label.toLowerCase()}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => {
                  const remaining = item.daysRemaining ?? daysRemaining(item.deletedAt);
                  return (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.displayName}</p>
                        {item.subtitle && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {item.subtitle}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {showDeletedBy && item.deletedByName
                            ? `Deleted by ${item.deletedByName} · `
                            : ""}
                          {format(new Date(item.deletedAt), "MMM d, yyyy")}
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
                        onClick={() => onRestore(item.id)}
                        disabled={isRestoring}
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
