"use client";

import { Button } from "../ui/button";
import { Plus } from "lucide-react";

interface CampaignPageActionsBaseProps {
  showTrash?: boolean;
  renderTrash?: () => React.ReactNode;
  onOpenDialog: () => void;
  renderDialog: () => React.ReactNode;
}

export function CampaignPageActionsBase({
  showTrash = true,
  renderTrash,
  onOpenDialog,
  renderDialog,
}: CampaignPageActionsBaseProps) {
  return (
    <>
      {showTrash && renderTrash?.()}

      {/* Desktop/tablet button (768px+) */}
      <Button onClick={onOpenDialog} className="hidden md:inline-flex">
        <Plus className="w-4 h-4 mr-2" />
        Create Campaign
      </Button>

      {/* Mobile FAB (<768px) */}
      <button
        onClick={onOpenDialog}
        className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
        aria-label="Create new campaign"
      >
        <Plus className="w-6 h-6" />
      </button>

      {renderDialog()}
    </>
  );
}
