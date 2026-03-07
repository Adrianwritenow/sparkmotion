"use client";

import { ChevronDown, ChevronUp, Info, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@sparkmotion/ui/sheet";

import { Badge } from "@sparkmotion/ui/badge";
import { Button } from "@sparkmotion/ui/button";
import type { ChangeRow } from "./change-logs-content";
import { format } from "date-fns";
import { getActionBadge } from "./change-table";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ChangeDetailSheetProps {
  row: ChangeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function diffValues(
  oldVal: Record<string, unknown> | null,
  newVal: Record<string, unknown> | null
) {
  const allKeys = new Set([
    ...Object.keys(oldVal ?? {}),
    ...Object.keys(newVal ?? {}),
  ]);
  return Array.from(allKeys).map((key) => ({
    key,
    old: oldVal?.[key],
    new: newVal?.[key],
    changed:
      JSON.stringify(oldVal?.[key]) !== JSON.stringify(newVal?.[key]),
  }));
}

function renderValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") return val;
  return JSON.stringify(val, null, 2);
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

export function ChangeDetailSheet({
  row,
  open,
  onOpenChange,
}: ChangeDetailSheetProps) {
  const [techDetailsOpen, setTechDetailsOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const bulkReassign = trpc.bands.bulkReassign.useMutation();

  if (!row) return null;

  const { label, className } = getActionBadge(row.action);
  const isAuthEvent = row.action.startsWith("auth.");
  const isReassign = row.action === "bands.bulkReassign";
  const [bandListOpen, setBandListOpen] = useState(false);

  const oldRecord = isRecord(row.oldValue)
    ? row.oldValue
    : Array.isArray(row.oldValue) && row.oldValue.length === 1 && isRecord(row.oldValue[0])
      ? row.oldValue[0]
      : null;
  const oldRecords = Array.isArray(row.oldValue) && row.oldValue.length > 1
    ? (row.oldValue as Record<string, unknown>[])
    : null;
  const newRecord = isRecord(row.newValue) ? row.newValue : null;

  // Extract auth event details from newValue when available
  const authDetail = isAuthEvent && isRecord(row.newValue) ? row.newValue : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={className} variant="outline">
              {label}
            </Badge>
          </div>
          <SheetTitle className="text-left text-sm font-medium text-muted-foreground">
            {format(row.createdAt, "EEEE, MMMM d, yyyy 'at' HH:mm:ss")}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="text-left space-y-1 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">User: </span>
                {row.user
                  ? `${row.user.name ?? ""} ${row.user.email}`.trim()
                  : "System"}
              </div>
              <div>
                <span className="font-medium text-foreground">Resource: </span>
                {row.resource}
                {row.resourceId ? ` / ${row.resourceId}` : " / N/A"}
              </div>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* Reassign view */}
          {isReassign ? (() => {
            const oldVal = isRecord(row.oldValue) ? row.oldValue : null;
            const newVal = isRecord(row.newValue) ? row.newValue : null;
            const sourceEvts = (oldVal?.sourceEvents as Array<{ id: string; name: string }>) ?? [];
            const targetEvt = newVal?.targetEvent as { id: string; name: string } | undefined;
            const bandCount = (newVal?.bandCount as number) ?? (oldVal?.bandCount as number) ?? 0;
            const bandIdList = (oldVal?.bandIds as string[]) ?? [];
            return (
              <div className="space-y-4">
                <div className="rounded-md border p-4 space-y-3">
                  <h3 className="text-sm font-semibold">
                    {bandCount} band{bandCount !== 1 ? "s" : ""} reassigned
                  </h3>
                  <div className="space-y-2">
                    {sourceEvts.map((src) => (
                      <div key={src.id} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{src.name}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{targetEvt?.name ?? "Unknown"}</span>
                      </div>
                    ))}
                    {sourceEvts.length === 0 && (
                      <p className="text-sm text-muted-foreground">Source event info not available</p>
                    )}
                  </div>
                </div>
                {bandIdList.length > 0 && (
                  <div className="border rounded-md">
                    <button
                      type="button"
                      className="flex items-center justify-between w-full p-3 text-sm font-medium"
                      onClick={() => setBandListOpen((prev) => !prev)}
                    >
                      Band IDs ({bandIdList.length})
                      {bandListOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {bandListOpen && (
                      <div className="border-t p-3 max-h-[200px] overflow-y-auto">
                        <div className="space-y-0.5">
                          {bandIdList.map((id) => (
                            <p key={id} className="font-mono text-xs">{id}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {oldVal?.bandsBySourceEvent && (
                  <div className="rounded-md border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950 p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                      Undo Reassignment
                    </h4>
                    <p className="text-xs text-orange-700 dark:text-orange-400">
                      This will move bands back to their original event(s). Tap history and counts lost
                      during the original reassignment cannot be recovered. Any new taps recorded since
                      will also be deleted.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={undoing}
                      onClick={async () => {
                        setUndoing(true);
                        try {
                          const groupedBySource = oldVal.bandsBySourceEvent as Record<string, string[]>;
                          for (const [sourceEventId, ids] of Object.entries(groupedBySource)) {
                            await bulkReassign.mutateAsync({
                              bandIds: ids,
                              targetEventId: sourceEventId,
                            });
                          }
                          toast.success("Reassignment undone successfully");
                          onOpenChange(false);
                        } catch (err: unknown) {
                          toast.error(err instanceof Error ? err.message : "Failed to undo reassignment");
                        } finally {
                          setUndoing(false);
                        }
                      }}
                    >
                      {undoing ? "Undoing..." : "Undo Reassignment"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })()
          : /* Auth event view */
          isAuthEvent ? (
            <div className="rounded-md border p-4 space-y-2">
              <h3 className="text-sm font-semibold">Auth Event Details</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Event Type</span>
                  <span className="font-medium">{row.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User Email</span>
                  <span className="font-medium">
                    {(authDetail?.email as string) ?? row.user?.email ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Result</span>
                  <Badge
                    className={
                      row.action.includes("success")
                        ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                        : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                    }
                    variant="outline"
                  >
                    {row.action.includes("success") ? "Success" : "Failure"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IP Address</span>
                  <span className="font-mono text-xs">
                    {row.ipAddress ?? "Not available"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Timestamp</span>
                  <span className="text-xs">
                    {row.createdAt.toISOString()}
                  </span>
                </div>
                {authDetail?.attemptNumber !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Attempt</span>
                    <span className="font-medium">
                      #{String(authDetail.attemptNumber)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Mutation diff view */
            <div className="grid grid-cols-2 gap-3">
              {/* Previous value */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Previous Value
                </h3>
                {oldRecords ? (
                  <div className="space-y-3">
                    {oldRecords.map((rec, idx) => (
                      <div key={idx} className="space-y-1 border-b pb-2 last:border-0">
                        <div className="text-xs font-medium text-muted-foreground">
                          Item {idx + 1}
                        </div>
                        {Object.entries(rec).map(([key, val]) => (
                          <div key={key} className="p-2 rounded text-xs bg-muted/30">
                            <div className="text-muted-foreground font-medium mb-1">{key}</div>
                            <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                              {renderValue(val)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : oldRecord === null ? (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Previous state not captured</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {diffValues(oldRecord, newRecord).map(
                      ({ key, old, changed }) => (
                        <div
                          key={key}
                          className={`p-2 rounded text-xs ${
                            changed
                              ? "bg-yellow-50 dark:bg-yellow-900/10"
                              : "bg-muted/30"
                          }`}
                        >
                          <div className="text-muted-foreground font-medium mb-1">
                            {key}
                          </div>
                          <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                            {renderValue(old)}
                          </pre>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* New value */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  New Value
                </h3>
                {newRecord === null ? (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>No new value captured</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {diffValues(oldRecord, newRecord).map(
                      ({ key, new: newVal, changed }) => (
                        <div
                          key={key}
                          className={`p-2 rounded text-xs ${
                            changed
                              ? "bg-yellow-50 dark:bg-yellow-900/10"
                              : "bg-muted/30"
                          }`}
                        >
                          <div className="text-muted-foreground font-medium mb-1">
                            {key}
                          </div>
                          <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                            {renderValue(newVal)}
                          </pre>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Collapsible technical details */}
          <div className="border rounded-md">
            <button
              type="button"
              className="flex items-center justify-between w-full p-3 text-sm font-medium"
              onClick={() => setTechDetailsOpen((prev) => !prev)}
            >
              Technical Details
              {techDetailsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {techDetailsOpen && (
              <div className="border-t p-3 space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground">IP Address</span>
                  <p className="font-mono mt-0.5">
                    {row.ipAddress ?? "Not available"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">User Agent</span>
                  <p
                    className="font-mono mt-0.5 truncate"
                    title={row.userAgent ?? ""}
                  >
                    {row.userAgent ?? "Not available"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Log ID</span>
                  <p className="font-mono mt-0.5 break-all">{row.id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Timestamp (ISO)</span>
                  <p className="font-mono mt-0.5">{row.createdAt.toISOString()}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
