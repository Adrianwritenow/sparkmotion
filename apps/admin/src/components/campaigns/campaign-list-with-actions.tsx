"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, X, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { CampaignCardList } from "./campaign-card-list";
import { DeleteCampaignsDialog } from "./delete-campaigns-dialog";

type CampaignItem = {
  id: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  org?: { name: string } | null;
  _count: { events: number };
  aggregateEngagement?: number;
  totalBands?: number;
  locations?: string[];
};

interface CampaignListWithActionsProps {
  campaigns: CampaignItem[];
  showOrg?: boolean;
}

const CAMPAIGN_SORT_OPTIONS = [
  { value: "createdAt", label: "Creation Date" },
  { value: "startDate", label: "Start Date" },
  { value: "endDate", label: "End Date" },
];

export function CampaignListWithActions({ campaigns, showOrg }: CampaignListWithActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const duplicateCampaigns = trpc.campaigns.duplicate.useMutation({
    onSuccess: () => {
      utils.campaigns.list.invalidate();
      setSelectedIds(new Set());
      router.refresh();
    },
  });

  const deleteCampaigns = trpc.campaigns.deleteMany.useMutation({
    onSuccess: () => {
      utils.campaigns.list.invalidate();
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      router.refresh();
    },
  });

  const handleSelectionChange = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === campaigns.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(campaigns.map((c) => c.id)));
    }
  };

  const handleDuplicate = () => {
    if (selectedIds.size === 0) return;
    duplicateCampaigns.mutate({ ids: Array.from(selectedIds) });
  };

  const handleDeleteConfirm = (deleteEvents: boolean) => {
    if (selectedIds.size === 0) return;
    deleteCampaigns.mutate({ ids: Array.from(selectedIds), deleteEvents });
  };

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return `?${params.toString()}`;
  };

  const handleSortChange = (value: string) => {
    router.push(buildUrl({ sort: value === "createdAt" ? undefined : value, page: undefined }));
  };

  const handleDirToggle = () => {
    const currentDir = searchParams.get("dir") ?? "desc";
    router.push(buildUrl({ dir: currentDir === "desc" ? "asc" : undefined, page: undefined }));
  };

  // Derive org name from selected campaigns
  const selectedCampaigns = campaigns.filter((c) => selectedIds.has(c.id));
  const uniqueOrgNames = [...new Set(selectedCampaigns.map((c) => c.org?.name).filter((n): n is string => !!n))];
  const multiOrg = uniqueOrgNames.length > 1;
  const deleteOrgName = uniqueOrgNames.length === 1 ? uniqueOrgNames[0]! : null;
  const associatedEventCount = selectedCampaigns.reduce((sum, c) => sum + c._count.events, 0);

  return (
    <div>
      {/* Select All + Sort Row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={campaigns.length > 0 && selectedIds.size === campaigns.length}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} of ${campaigns.length} selected`
              : "Select all"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Select
            value={searchParams.get("sort") ?? "createdAt"}
            onValueChange={handleSortChange}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleDirToggle}
            title={searchParams.get("dir") === "asc" ? "Ascending" : "Descending"}
          >
            {searchParams.get("dir") === "asc" ? (
              <ArrowUp className="w-3.5 h-3.5" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Campaign List */}
      <CampaignCardList
        campaigns={campaigns}
        showOrg={showOrg}
        selectable={true}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
      />

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-6 z-50 flex justify-center">
          <div className="flex items-center gap-3 bg-background border border-border rounded-lg shadow-lg px-4 py-3">
            <span className="text-sm font-medium">
              {selectedIds.size} campaign{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <Button
              size="sm"
              onClick={handleDuplicate}
              disabled={duplicateCampaigns.isPending}
            >
              <Copy className="w-4 h-4 mr-2" />
              {duplicateCampaigns.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteCampaignsDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        count={selectedIds.size}
        campaignNames={selectedCampaigns.map((c) => c.name)}
        orgName={deleteOrgName}
        multiOrg={multiOrg}
        associatedEventCount={associatedEventCount}
        onConfirm={handleDeleteConfirm}
        isPending={deleteCampaigns.isPending}
      />
    </div>
  );
}
