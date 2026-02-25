"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, LinkIcon } from "lucide-react";
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
import { EventMultiSelect } from "./event-multi-select";
import { EventListWithActions } from "@/components/events/event-list-with-actions";
import { EventFormDialog } from "@/components/events/event-form-dialog";

interface CampaignEventsTabProps {
  campaignId: string;
  orgId: string;
  events: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    location?: string | null;
    org?: { name: string } | null;
    _count: { bands: number };
    tapCount?: number;
    engagementPercent?: number;
  }>;
  orgs: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
}

export function CampaignEventsTab({
  campaignId,
  orgId,
  events,
  orgs,
  campaigns,
}: CampaignEventsTabProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  const { data: availableEvents = [] } = trpc.campaigns.availableEvents.useQuery(
    { campaignId },
    { enabled: addDialogOpen }
  );

  const addEvents = trpc.campaigns.addEvents.useMutation({
    onSuccess: () => {
      utils.campaigns.byId.invalidate({ id: campaignId });
      utils.campaigns.availableEvents.invalidate({ campaignId });
      setSelectedEventIds([]);
      setAddDialogOpen(false);
      router.refresh();
    },
  });

  const handleAddEvents = () => {
    if (selectedEventIds.length === 0) return;
    addEvents.mutate({ campaignId, eventIds: selectedEventIds });
  };

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
          <LinkIcon className="w-4 h-4 mr-2" />
          Add Existing Event
        </Button>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Event
        </Button>
      </div>

      {/* Event List */}
      {events.length > 0 ? (
        <EventListWithActions events={events} showOrg={false} />
      ) : (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground">
            No events associated with this campaign yet.
          </p>
        </div>
      )}

      {/* Add Existing Events Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Events to Campaign</DialogTitle>
            <DialogDescription>
              Select unassigned events to add to this campaign.
            </DialogDescription>
          </DialogHeader>
          <EventMultiSelect
            events={availableEvents}
            selected={selectedEventIds}
            onChange={setSelectedEventIds}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddEvents}
              disabled={selectedEventIds.length === 0 || addEvents.isPending}
            >
              {addEvents.isPending
                ? "Adding..."
                : `Add ${selectedEventIds.length || ""} Event${selectedEventIds.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Event Dialog */}
      <EventFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        orgs={orgs}
        campaigns={campaigns}
        campaignId={campaignId}
      />
    </div>
  );
}
