"use client";

import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Flag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

export interface BandDetailRow {
  id: string;
  bandId: string;
  name?: string | null;
  email?: string | null;
  tapCount: number;
  firstTapAt?: string | null;
  lastTapAt: string | null;
  autoAssigned: boolean;
  autoAssignDistance?: number | null;
  flagged: boolean;
  flagReason?: string | null;
  event: { id: string; name: string; status: string };
  tag?: { id: string; title: string } | null;
  tagId?: string | null;
}

export interface BandTapLogRow {
  id: string;
  event: { name: string };
  window?: { title?: string | null } | null;
  modeServed: string;
  tappedAt: string | Date;
}

interface BandDetailDialogBaseProps {
  band: BandDetailRow | null;
  tags: Array<{ id: string; title: string }>;
  tapLogs?: BandTapLogRow[] | null;
  tapLogsLoading?: boolean;
  onClose: () => void;
  onReassign: (bandId: string) => void;
  onSave: (payload: { id: string; name: string | null; email: string | null; tagId: string | null }) => void;
  onResolve?: (bandId: string) => void;
  isSaving?: boolean;
  isResolving?: boolean;
  saveError?: string | null;
}

const MODE_LABELS: Record<string, string> = {
  PRE: "Pre-Event",
  LIVE: "Live Event",
  POST: "Post-Event",
  FALLBACK: "Fallback",
  DEFAULT: "Default",
};

export function BandDetailDialogBase({
  band,
  tags,
  tapLogs,
  tapLogsLoading,
  onClose,
  onReassign,
  onSave,
  onResolve,
  isSaving,
  isResolving,
  saveError,
}: BandDetailDialogBaseProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tagId, setTagId] = useState("");

  useEffect(() => {
    if (band) {
      setName(band.name ?? "");
      setEmail(band.email ?? "");
      setTagId(band.tag?.id ?? band.tagId ?? "");
    }
  }, [band]);

  const handleSave = () => {
    if (!band) return;
    onSave({
      id: band.id,
      name: name || null,
      email: email || null,
      tagId: tagId && tagId !== "none" ? tagId : null,
    });
  };

  return (
    <Dialog open={!!band} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-mono">{band?.bandId}</DialogTitle>
        </DialogHeader>

        {band && (
          <div className="space-y-5">
            {/* Read-only info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Event</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-medium">{band.event.name}</span>
                  <Badge
                    variant={band.event.status === "ACTIVE" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {band.event.status}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Taps</span>
                <p className="font-medium mt-0.5">{band.tapCount.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Auto-assigned</span>
                <p className="font-medium mt-0.5">{band.autoAssigned ? "Yes" : "No"}</p>
              </div>
              {band.autoAssigned && (
                <div>
                  <span className="text-muted-foreground">Assign Distance</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-medium">
                      {band.autoAssignDistance != null
                        ? `${band.autoAssignDistance.toFixed(1)} mi`
                        : "Unknown"}
                    </span>
                    {band.flagged && (
                      <span title={band.flagReason || "Flagged"}>
                        <Flag className="w-4 h-4 fill-red-500 text-red-500" />
                      </span>
                    )}
                  </div>
                </div>
              )}
              {band.flagged && band.flagReason && (
                <div>
                  <span className="text-muted-foreground">Flag Reason</span>
                  <p className="font-medium mt-0.5 text-red-600 dark:text-red-400">{band.flagReason}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">First Tap</span>
                <p className="font-medium mt-0.5">
                  {band.firstTapAt ? new Date(band.firstTapAt).toLocaleString() : "Never"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Last Tap</span>
                <p className="font-medium mt-0.5">
                  {band.lastTapAt ? new Date(band.lastTapAt).toLocaleString() : "Never"}
                </p>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="metadata">
              <TabsList className="w-full">
                <TabsTrigger value="metadata" className="flex-1">Metadata</TabsTrigger>
                <TabsTrigger value="taplog" className="flex-1">Tap Log</TabsTrigger>
              </TabsList>

              <TabsContent value="metadata" className="mt-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Name</label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Registrant name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Email</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Registrant email"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Tag</label>
                    <Select value={tagId} onValueChange={setTagId}>
                      <SelectTrigger>
                        <SelectValue placeholder="No tag" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No tag</SelectItem>
                        {tags.map((tag) => (
                          <SelectItem key={tag.id} value={tag.id}>
                            {tag.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {saveError && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-3">
                    {saveError}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="taplog" className="mt-4">
                {tapLogsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : !tapLogs?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No taps recorded
                  </p>
                ) : (
                  <div className="max-h-[300px] overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Event</TableHead>
                          <TableHead>Window</TableHead>
                          <TableHead>Date & Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tapLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm">{log.event.name}</TableCell>
                            <TableCell className="text-sm">
                              {log.window?.title ?? MODE_LABELS[log.modeServed] ?? log.modeServed}
                            </TableCell>
                            <TableCell className="text-sm">
                              {new Date(log.tappedAt).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => band && onReassign(band.id)}
            >
              Reassign
            </Button>
            {band?.flagged && onResolve && (
              <Button
                variant="outline"
                onClick={() => onResolve(band.id)}
                disabled={isResolving}
              >
                {isResolving ? "Resolving..." : "Resolve"}
              </Button>
            )}
          </div>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
