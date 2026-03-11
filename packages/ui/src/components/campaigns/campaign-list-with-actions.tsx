"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, X, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { CampaignCardList } from "./campaign-card-list";
import { DeleteCampaignsDialogBase } from "./delete-campaigns-dialog";

export type CampaignListItem = {
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

interface CampaignListWithActionsBaseProps {
  campaigns: CampaignListItem[];
  showOrg?: boolean;
  orgName: string;
  allowMultiOrgSelection: boolean;
  totalCount?: number;
  onFetchAllIds: (filters: { search?: string; status?: string }) => Promise<string[]>;
  onDuplicate: (ids: string[]) => Promise<void>;
  onDelete: (ids: string[], deleteEvents: boolean) => Promise<void>;
}

const CAMPAIGN_SORT_OPTIONS = [
  { value: "createdAt", label: "Creation Date" },
  { value: "startDate", label: "Start Date" },
  { value: "endDate", label: "End Date" },
];

export function CampaignListWithActionsBase({
  campaigns,
  showOrg,
  orgName,
  allowMultiOrgSelection,
  totalCount,
  onFetchAllIds,
  onDuplicate,
  onDelete,
}: CampaignListWithActionsBaseProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectAllAcrossPages, setSelectAllAcrossPages] = useState(false);
  const [shouldFetchAllIds, setShouldFetchAllIds] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!shouldFetchAllIds) return;
    const run = async () => {
      const ids = await onFetchAllIds({
        search: searchParams.get("search") ?? undefined,
        status: searchParams.get("status") ?? undefined,
      });
      setSelectedIds(new Set(ids));
      setSelectAllAcrossPages(true);
      setShouldFetchAllIds(false);
    };
    run();
  }, [shouldFetchAllIds, onFetchAllIds, searchParams]);

  const handleSelectionChange = (id: string) => {
    setSelectAllAcrossPages(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === campaigns.length && !selectAllAcrossPages) {
      setSelectedIds(new Set());
    } else {
      setSelectAllAcrossPages(false);
      setSelectedIds(new Set(campaigns.map((c) => c.id)));
    }
  };

  const handleDuplicate = async () => {
    if (selectedIds.size === 0) return;
    setIsDuplicating(true);
    try {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i += 50) {
        await onDuplicate(ids.slice(i, i + 50));
      }
      setSelectedIds(new Set());
      setSelectAllAcrossPages(false);
      router.refresh();
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDeleteConfirm = async (deleteEvents: boolean) => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      for (let i = 0; i < ids.length; i += 50) {
        await onDelete(ids.slice(i, i + 50), deleteEvents);
      }
      setSelectedIds(new Set());
      setSelectAllAcrossPages(false);
      setDeleteDialogOpen(false);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
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
    router.push(buildUrl({ sort: value === "startDate" ? undefined : value, page: undefined }));
  };

  const handleDirToggle = () => {
    const currentDir = searchParams.get("dir") ?? "asc";
    router.push(buildUrl({ dir: currentDir === "asc" ? "desc" : undefined, page: undefined }));
  };

  const selectedCampaigns = campaigns.filter((c) => selectedIds.has(c.id));
  const uniqueOrgNames = [...new Set(selectedCampaigns.map((c) => c.org?.name).filter((n): n is string => !!n))];
  const multiOrg = allowMultiOrgSelection && uniqueOrgNames.length > 1;
  const deleteOrgName = uniqueOrgNames.length === 1 ? uniqueOrgNames[0]! : orgName;
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
            value={searchParams.get("sort") ?? "startDate"}
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
            title={searchParams.get("dir") === "desc" ? "Descending" : "Ascending"}
          >
            {searchParams.get("dir") === "desc" ? (
              <ArrowDown className="w-3.5 h-3.5" />
            ) : (
              <ArrowUp className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      {selectedIds.size === campaigns.length && campaigns.length > 0 && totalCount && totalCount > campaigns.length && !selectAllAcrossPages && (
        <div className="text-sm text-center py-2 bg-muted/50 rounded-md mb-4">
          All {campaigns.length} on this page selected.{" "}
          <button
            className="text-primary underline hover:no-underline"
            onClick={() => setShouldFetchAllIds(true)}
          >
            Select all {totalCount} matching this filter
          </button>
        </div>
      )}
      {selectAllAcrossPages && (
        <div className="text-sm text-center py-2 bg-primary/10 rounded-md mb-4">
          All {selectedIds.size} selected.{" "}
          <button
            className="text-primary underline hover:no-underline"
            onClick={() => {
              setSelectAllAcrossPages(false);
              setSelectedIds(new Set());
            }}
          >
            Clear selection
          </button>
        </div>
      )}

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
            <Button size="sm" onClick={handleDuplicate} disabled={isDuplicating}>
              <Copy className="w-4 h-4 mr-2" />
              {isDuplicating ? "Duplicating..." : "Duplicate"}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
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
      <DeleteCampaignsDialogBase
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        count={selectedIds.size}
        campaignNames={selectedCampaigns.map((c) => c.name)}
        orgName={deleteOrgName}
        multiOrg={multiOrg}
        associatedEventCount={associatedEventCount}
        onConfirm={handleDeleteConfirm}
        isPending={isDeleting}
      />
    </div>
  );
}
