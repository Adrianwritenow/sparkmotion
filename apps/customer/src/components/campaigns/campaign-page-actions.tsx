"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CampaignFormDialog } from "./campaign-form-dialog";

interface CampaignPageActionsProps {
  orgId: string;
  availableEvents: Array<{ id: string; name: string; campaign: { name: string } | null }>;
}

export function CampaignPageActions({
  orgId,
  availableEvents,
}: CampaignPageActionsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      {/* Desktop/tablet button (768px+) */}
      <Button
        onClick={() => setDialogOpen(true)}
        className="hidden md:inline-flex"
      >
        <Plus className="w-4 h-4 mr-2" />
        Create Campaign
      </Button>

      {/* Mobile FAB (<768px) */}
      <button
        onClick={() => setDialogOpen(true)}
        className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
        aria-label="Create new campaign"
      >
        <Plus className="w-6 h-6" />
      </button>

      <CampaignFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgId={orgId}
        availableEvents={availableEvents}
      />
    </>
  );
}
