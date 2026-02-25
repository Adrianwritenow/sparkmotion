"use client";

import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EventForm } from "./event-form";

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgs: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
  campaignId?: string;
}

export function EventFormDialog({
  open,
  onOpenChange,
  orgs,
  campaigns,
  campaignId,
}: EventFormDialogProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const createEvent = trpc.events.create.useMutation({
    onSuccess: () => {
      utils.events.list.invalidate();
      if (campaignId) {
        utils.campaigns.byId.invalidate({ id: campaignId });
        utils.campaigns.availableEvents.invalidate({ campaignId });
      }
      onOpenChange(false);
      router.refresh();
    },
  });

  const handleSubmit = async (values: any) => {
    await createEvent.mutateAsync({
      ...values,
      ...(campaignId ? { campaignId } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Event</DialogTitle>
          <DialogDescription>
            Fill in the details below to create a new event.
          </DialogDescription>
        </DialogHeader>

        <EventForm
          onSubmit={handleSubmit}
          isPending={createEvent.isPending}
          orgs={orgs}
          campaigns={campaigns}
          defaultCampaignId={campaignId}
        />
      </DialogContent>
    </Dialog>
  );
}
