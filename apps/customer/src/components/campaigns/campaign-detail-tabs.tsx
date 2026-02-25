"use client";

import { useRouter } from "next/navigation";
import { CampaignEditForm } from "./campaign-edit-form";
import { CampaignAnalytics } from "./campaign-analytics";
import { CampaignEventsTab } from "./campaign-events-tab";
import { CampaignSettings } from "./campaign-settings";
import type { Campaign } from "@sparkmotion/database";

interface CampaignDetailTabsProps {
  campaign: Campaign & {
    org?: { name: string } | null;
    events?: Array<{
      id: string;
      name: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      location?: string | null;
      org?: { name: string } | null;
      _count: { bands: number };
      tapCount?: number;
      engagementPercent?: number;
    }>;
    _count: { events: number };
    aggregateEngagement?: number;
    totalBands?: number;
    totalUniqueTaps?: number;
    locations?: string[];
  };
  activeTab: string;
  campaigns: Array<{ id: string; name: string }>;
  orgName: string;
}

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "events", label: "Events" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

export function CampaignDetailTabs({
  campaign,
  activeTab,
  campaigns,
  orgName,
}: CampaignDetailTabsProps) {
  const router = useRouter();

  const handleTabChange = (tabId: string) => {
    router.push(`/campaigns/${campaign.id}?tab=${tabId}`, { scroll: false });
  };

  return (
    <>
      {/* Tab Navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && (
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="font-semibold text-foreground mb-6">
              Campaign Information
            </h3>
            <CampaignEditForm campaign={campaign} />
          </div>
        )}

        {activeTab === "events" && (
          <CampaignEventsTab
            campaignId={campaign.id}
            orgId={campaign.orgId}
            events={campaign.events ?? []}
            campaigns={campaigns}
            orgName={orgName}
          />
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            <CampaignAnalytics
              campaignId={campaign.id}
              campaignName={campaign.name}
              orgName={campaign.org?.name ?? ""}
              eventNames={(campaign.events ?? []).filter((e) => e.status === "ACTIVE" || e.status === "COMPLETED").map((e) => ({ id: e.id, name: e.name }))}
            />
          </div>
        )}

        {activeTab === "settings" && (
          <CampaignSettings campaign={campaign} />
        )}
      </div>
    </>
  );
}
