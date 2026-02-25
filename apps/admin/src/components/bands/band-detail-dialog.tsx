"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Flag } from "lucide-react";
import {
  Dialog,
  DialogContent,
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

interface BandRow {
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
  event: { id: string; name: string; status: string };
  tag?: { id: string; title: string } | null;
  tagId?: string | null;
}

interface BandDetailDialogProps {
  band: BandRow | null;
  onClose: () => void;
  onReassign: (bandId: string) => void;
}

export function BandDetailDialog({ band, onClose, onReassign }: BandDetailDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tagId, setTagId] = useState("");

  const utils = trpc.useUtils();
  const { data: tagsData } = trpc.tags.list.useQuery();
  const tags = tagsData ?? [];

  const updateBand = trpc.bands.update.useMutation({
    onSuccess: () => {
      utils.bands.listAll.invalidate();
      onClose();
    },
  });

  const resolveBands = trpc.bands.resolve.useMutation({
    onSuccess: () => {
      utils.bands.listAll.invalidate();
      utils.bands.flaggedCount.invalidate();
      onClose();
    },
  });

  useEffect(() => {
    if (band) {
      setName(band.name ?? "");
      setEmail(band.email ?? "");
      setTagId(band.tag?.id ?? band.tagId ?? "");
    }
  }, [band]);

  const handleSave = () => {
    if (!band) return;
    updateBand.mutate({
      id: band.id,
      name: name || null,
      email: email || null,
      tagId: tagId && tagId !== "none" ? tagId : null,
    });
  };

  return (
    <Dialog open={!!band} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
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
                      <Flag className="w-4 h-4 fill-red-500 text-red-500" />
                    )}
                  </div>
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

            {/* Editable fields */}
            <div className="space-y-3 border-t pt-4">
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
                    {tags.map((tag: { id: string; title: string }) => (
                      <SelectItem key={tag.id} value={tag.id}>
                        {tag.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {updateBand.error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {updateBand.error.message}
              </p>
            )}
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
            {band?.flagged && (
              <Button
                variant="outline"
                onClick={() => resolveBands.mutate({ ids: [band.id] })}
                disabled={resolveBands.isPending}
              >
                {resolveBands.isPending ? "Resolving..." : "Resolve"}
              </Button>
            )}
          </div>
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateBand.isPending}>
            {updateBand.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
