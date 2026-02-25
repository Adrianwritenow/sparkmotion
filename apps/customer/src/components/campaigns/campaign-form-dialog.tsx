"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CampaignForm } from "./campaign-form";
import { EventMultiSelect } from "./event-multi-select";
import { EventForm } from "@/components/events/event-form";

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  availableEvents: Array<{ id: string; name: string; campaign: { name: string } | null }>;
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  orgId,
  availableEvents,
}: CampaignFormDialogProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [createEventOpen, setCreateEventOpen] = useState(false);

  const createCampaign = trpc.campaigns.create.useMutation({
    onSuccess: () => {
      utils.campaigns.list.invalidate();
      onOpenChange(false);
      setSelectedEventIds([]);
      router.refresh();
    },
  });

  const createEvent = trpc.events.create.useMutation({
    onSuccess: (newEvent) => {
      // Add the newly created event to selected events
      setSelectedEventIds((prev) => [...prev, newEvent.id]);
      setCreateEventOpen(false);
      router.refresh();
    },
  });

  const handleCampaignSubmit = async (values: any) => {
    const data = {
      ...values,
      orgId, // Inject orgId from session
      startDate: values.startDate ?? undefined,
      endDate: values.endDate ?? undefined,
      eventIds: selectedEventIds.length > 0 ? selectedEventIds : undefined,
    };

    await createCampaign.mutateAsync(data);
  };

  const handleEventSubmit = async (values: any) => {
    // Inject orgId for event creation
    const eventData = {
      ...values,
      orgId,
    };
    await createEvent.mutateAsync(eventData);
  };

  return (
    <>
      {/* Main Campaign Creation Dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
            <DialogDescription>
              Create a new campaign and optionally associate existing events.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Campaign Form */}
            <CampaignForm
              onSubmit={handleCampaignSubmit}
              isPending={createCampaign.isPending}
            />

            {/* Associated Events Section */}
            <div className="border-t pt-6 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  Associated Events
                </h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Select existing events to associate with this campaign, or
                  create a new event.
                </p>
              </div>

              <EventMultiSelect
                events={availableEvents}
                selected={selectedEventIds}
                onChange={setSelectedEventIds}
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateEventOpen(true)}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New Event
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested Event Creation Dialog */}
      <Dialog open={createEventOpen} onOpenChange={setCreateEventOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Event</DialogTitle>
            <DialogDescription>
              Create a new event that will be automatically associated with this
              campaign.
            </DialogDescription>
          </DialogHeader>

          <EventForm
            onSubmit={handleEventSubmit}
            isPending={createEvent.isPending}
            campaigns={[]}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
