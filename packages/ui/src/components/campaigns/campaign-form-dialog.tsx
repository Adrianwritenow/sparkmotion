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
} from "../ui/dialog";
import { Button } from "../ui/button";
import { CampaignFormBase } from "./campaign-form";
import { EventMultiSelect } from "./event-multi-select";
import { EventForm } from "@/components/events/event-form";

interface AvailableEvent {
  id: string;
  name: string;
  campaign: { name: string } | null;
}

interface CampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableEvents: AvailableEvent[];
  /** Admin: pass org list to show org selector */
  orgs?: Array<{ id: string; name: string }>;
  /** Customer: inject orgId into submission data */
  orgId?: string;
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  availableEvents,
  orgs,
  orgId,
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
      setSelectedEventIds((prev) => [...prev, newEvent.id]);
      setCreateEventOpen(false);
      router.refresh();
    },
  });

  const handleCampaignSubmit = async (values: any) => {
    const data: any = {
      ...values,
      startDate: values.startDate ?? undefined,
      endDate: values.endDate ?? undefined,
      eventIds: selectedEventIds.length > 0 ? selectedEventIds : undefined,
    };

    // Customer: inject orgId since form has no org selector
    if (orgId && !values.orgId) {
      data.orgId = orgId;
    }

    await createCampaign.mutateAsync(data);
  };

  const handleEventSubmit = async (values: any) => {
    const eventData = orgId ? { ...values, orgId } : values;
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
            <CampaignFormBase
              onSubmit={handleCampaignSubmit}
              isPending={createCampaign.isPending}
              orgOptions={orgs}
              requireOrg={!!orgs && orgs.length > 0}
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
            orgs={orgs ?? []}
            campaigns={[]}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
