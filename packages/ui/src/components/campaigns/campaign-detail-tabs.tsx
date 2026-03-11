"use client";

import { useRouter } from "next/navigation";
import type { Campaign } from "@sparkmotion/database";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "events", label: "Events" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

interface CampaignDetailTabsBaseProps {
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
      autoLifecycle?: boolean;
    }>;
    _count: { events: number };
    aggregateEngagement?: number;
    totalBands?: number;
    totalUniqueTaps?: number;
    locations?: string[];
  };
  activeTab: string;
  renderOverview: () => React.ReactNode;
  renderEvents: () => React.ReactNode;
  renderAnalytics: () => React.ReactNode;
  renderSettings: () => React.ReactNode;
}

export function CampaignDetailTabsBase({
  campaign,
  activeTab,
  renderOverview,
  renderEvents,
  renderAnalytics,
  renderSettings,
}: CampaignDetailTabsBaseProps) {
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
        {activeTab === "overview" && renderOverview()}
        {activeTab === "events" && renderEvents()}
        {activeTab === "analytics" && renderAnalytics()}
        {activeTab === "settings" && renderSettings()}
      </div>
    </>
  );
}
