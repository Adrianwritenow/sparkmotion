"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { Plus } from "lucide-react";
import { EventFormDialog } from "./event-form-dialog";
import { EventTrashButton } from "./event-trash-button";

interface EventPageActionsProps {
  campaigns: Array<{ id: string; name: string }>;
  /** Admin: pass orgs array to render org selector in the create dialog */
  orgs?: Array<{ id: string; name: string }>;
  /** Customer: pass orgId to inject on create submit */
  orgId?: string;
  showTrash?: boolean;
}

export function EventPageActions({ campaigns, orgs, orgId, showTrash = true }: EventPageActionsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      {/* Trash button */}
      {showTrash && <EventTrashButton showDeletedBy={!!orgs} />}

      {/* Desktop/tablet button (768px+) */}
      <Button
        onClick={() => setDialogOpen(true)}
        className="hidden md:inline-flex"
      >
        <Plus className="w-4 h-4 mr-2" />
        New Event
      </Button>

      {/* Mobile FAB (<768px) */}
      <button
        onClick={() => setDialogOpen(true)}
        className="md:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center"
        aria-label="Create new event"
      >
        <Plus className="w-6 h-6" />
      </button>

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgs={orgs}
        orgId={orgId}
        campaigns={campaigns}
      />
    </>
  );
}
