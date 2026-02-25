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
  orgId: string;
  campaigns: Array<{ id: string; name: string }>;
  campaignId?: string;
}

export function EventFormDialog({
  open,
  onOpenChange,
  orgId,
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
      orgId,
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
          campaigns={campaigns}
          defaultCampaignId={campaignId}
        />
      </DialogContent>
    </Dialog>
  );
}
