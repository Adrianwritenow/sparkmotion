"use client";

import { Button } from "../ui/button";
import { Plus, LinkIcon } from "lucide-react";

interface CampaignEventsTabBaseProps {
  eventsCount: number;
  onAddExisting: () => void;
  onCreate: () => void;
  renderEventList: () => React.ReactNode;
  renderAddDialog: () => React.ReactNode;
  renderCreateDialog: () => React.ReactNode;
  emptyState?: React.ReactNode;
}

export function CampaignEventsTabBase({
  eventsCount,
  onAddExisting,
  onCreate,
  renderEventList,
  renderAddDialog,
  renderCreateDialog,
  emptyState,
}: CampaignEventsTabBaseProps) {
  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onAddExisting}>
          <LinkIcon className="w-4 h-4 mr-2" />
          Add Existing Event
        </Button>
        <Button size="sm" onClick={onCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Create Event
        </Button>
      </div>

      {/* Event List */}
      {eventsCount > 0 ? (
        renderEventList()
      ) : (
        emptyState ?? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <p className="text-muted-foreground">
              No events associated with this campaign yet.
            </p>
          </div>
        )
      )}

      {/* Add Existing Events Dialog */}
      {renderAddDialog()}

      {/* Create Event Dialog */}
      {renderCreateDialog()}
    </div>
  );
}
