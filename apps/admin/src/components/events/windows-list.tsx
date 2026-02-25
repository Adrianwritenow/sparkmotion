"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ModeIndicator } from "./mode-indicator";
import { WindowFormDialog } from "./window-form";
import { DateTimeDisplay } from "./datetime-display";
import { Shield, Clock, ExternalLink, Pencil, Plus, Trash2, Check, X, CalendarClock } from "lucide-react";
import { toast } from "sonner";

interface WindowsListProps {
  eventId: string;
}

export function WindowsList({ eventId }: WindowsListProps) {
  const utils = trpc.useUtils();
  const { data: windows, isLoading } = trpc.windows.list.useQuery({ eventId });
  const { data: event } = trpc.events.byId.useQuery({ id: eventId });
  const { data: user } = trpc.users.me.useQuery();

  const eventTimezone = event?.timezone || 'UTC';
  const browserTz = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const userTimezone = user?.timezone || browserTz;

  const toggleScheduleMode = trpc.events.toggleScheduleMode.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
    },
  });

  const toggleWindow = trpc.windows.toggle.useMutation({
    onSuccess: (data, variables) => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });

      // Toast feedback based on whether schedule mode was disabled
      if (event?.scheduleMode) {
        toast.success("Window activated manually. Schedule mode disabled.");
      } else if (variables.isActive) {
        toast.success("Window updated");
      }
    },
  });

  const deleteWindow = trpc.windows.delete.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
    },
  });

  const upsertFallback = trpc.windows.upsertFallback.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
      setEditingFallback(false);
    },
  });

  const [editingFallback, setEditingFallback] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState("");

  const handleDelete = async (windowId: string) => {
    if (confirm("Are you sure you want to delete this window?")) {
      await deleteWindow.mutateAsync({ id: windowId });
    }
  };

  const routingWindows = windows || [];
  const fallbackInUse = routingWindows.length === 0 || !routingWindows.some((w) => w.isActive);

  // Smart timeout: refetch at exact transition times when schedule mode is on
  useEffect(() => {
    if (!event?.scheduleMode || !windows || windows.length === 0) return;

    const now = Date.now();

    // Collect all future start and end times
    const futureTimes = windows
      .flatMap((w) => [w.startTime, w.endTime])
      .filter((t): t is Date => t != null)
      .map((t) => new Date(t).getTime())
      .filter((t) => t > now)
      .sort((a, b) => a - b);

    if (futureTimes.length === 0) return;

    const nextTransition = futureTimes[0]!;
    // Add 500ms buffer to ensure the server evaluates correctly
    const delay = nextTransition - now + 500;

    const timer = setTimeout(() => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
    }, delay);

    return () => clearTimeout(timer);
  }, [event?.scheduleMode, windows, eventId, utils]);

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="font-semibold text-foreground">URL Manager</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage redirect destinations based on routing windows.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading windows...</div>
      ) : (
        <div className="space-y-4">
          {/* Schedule Mode Toggle */}
          <div className="flex items-center justify-between bg-muted/50 border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <CalendarClock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Schedule Mode</p>
                <p className="text-xs text-muted-foreground">
                  {event?.scheduleMode
                    ? "Windows activate automatically based on their scheduled times"
                    : "Manually control which window is active"}
                </p>
              </div>
            </div>
            <Switch
              checked={event?.scheduleMode ?? false}
              onCheckedChange={(checked) => {
                toggleScheduleMode.mutate({ id: eventId, enabled: checked });
                if (checked) {
                  toast.success("Schedule mode enabled");
                } else {
                  toast.success("Schedule mode disabled");
                }
              }}
              disabled={toggleScheduleMode.isPending}
            />
          </div>
          {/* Fallback URL Section */}
          <div className={`border rounded-lg p-4 ${
            fallbackInUse
              ? "bg-green-50/30 dark:bg-green-900/5 border-green-500/50"
              : "bg-amber-50/50 dark:bg-amber-900/10 border-amber-200/60 dark:border-amber-800/30"
          }`}>
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-md mt-0.5">
                <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-medium text-foreground">Fallback URL</h4>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded">
                    Always Active
                  </span>
                  {fallbackInUse && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-green-600 bg-green-50 px-1.5 py-0.5 rounded dark:bg-green-900/20 dark:text-green-400">
                      IN USE
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Visitors are sent here when no routing window is currently active.
                </p>
                {editingFallback ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="url"
                      value={fallbackUrl}
                      onChange={(e) => setFallbackUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="h-8 text-xs flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (fallbackUrl) upsertFallback.mutate({ eventId, url: fallbackUrl });
                        }
                        if (e.key === "Escape") setEditingFallback(false);
                      }}
                    />
                    <button
                      onClick={() => {
                        if (fallbackUrl) upsertFallback.mutate({ eventId, url: fallbackUrl });
                      }}
                      disabled={!fallbackUrl || upsertFallback.isPending}
                      className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors disabled:opacity-50"
                      title="Save"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingFallback(false)}
                      className="p-1.5 text-muted-foreground hover:bg-muted rounded-md transition-colors"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : event?.fallbackUrl ? (
                  <div className="flex items-center gap-1.5 text-xs text-foreground/80">
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{event.fallbackUrl}</span>
                    <button
                      onClick={() => {
                        setFallbackUrl(event.fallbackUrl || "");
                        setEditingFallback(true);
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors ml-1"
                      title="Edit fallback URL"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setFallbackUrl("");
                      setEditingFallback(true);
                    }}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Set fallback URL
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Routing Windows Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">Routing Windows</h4>
              <WindowFormDialog
                eventId={eventId}
                existingWindows={windows || []}
                eventTimezone={eventTimezone}
                trigger={
                  <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary border border-border rounded-md hover:bg-muted transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                    Add Window
                  </button>
                }
              />
            </div>

            {routingWindows.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">No routing windows configured</p>
              </div>
            ) : (
              <div className="space-y-2">
                {routingWindows.map((window) => (
                  <div
                    key={window.id}
                    className={`bg-background border rounded-lg p-4 transition-all ${
                      window.isActive
                        ? "border-green-500/50 bg-green-50/30 dark:bg-green-900/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          window.isActive ? "bg-green-500" : "bg-muted-foreground/30"
                        }`}
                      />
                      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-6 gap-y-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <ModeIndicator
                            mode={window.windowType.toLowerCase() as "pre" | "live" | "post"}
                          />
                          {window.title && (
                            <span className="text-sm font-medium truncate">{window.title}</span>
                          )}
                          {window.isActive && (
                            <span className="text-[10px] font-medium uppercase tracking-wide text-green-600 bg-green-50 px-1.5 py-0.5 rounded dark:bg-green-900/20 dark:text-green-400">
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {window.startTime && window.endTime ? (
                              <>
                                <DateTimeDisplay
                                  date={window.startTime}
                                  eventTimezone={eventTimezone}
                                  userTimezone={userTimezone}
                                  format="MMM d, h:mm a"
                                />
                                {" – "}
                                <DateTimeDisplay
                                  date={window.endTime}
                                  eventTimezone={eventTimezone}
                                  userTimezone={userTimezone}
                                  format="MMM d, h:mm a zzz"
                                />
                              </>
                            ) : "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{window.url || "No URL set"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div
                          className={event?.scheduleMode ? "opacity-50" : ""}
                          title={event?.scheduleMode ? "Disable schedule mode to toggle manually" : undefined}
                        >
                          <Switch
                            checked={window.isActive}
                            onCheckedChange={(checked) =>
                              toggleWindow.mutate({ id: window.id, isActive: checked })
                            }
                            disabled={event?.scheduleMode || toggleWindow.isPending}
                          />
                        </div>
                        <WindowFormDialog
                          eventId={eventId}
                          window={window}
                          existingWindows={windows || []}
                          eventTimezone={eventTimezone}
                          trigger={
                            <button
                              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                              title="Edit window"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          }
                        />
                        <button
                          onClick={() => handleDelete(window.id)}
                          className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          title="Delete window"
                          disabled={deleteWindow.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}


          </div>
        </div>
      )}
    </div>
  );
}
