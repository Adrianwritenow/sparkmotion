"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, Building2, Megaphone, MapPin, TrendingUp, Users } from "lucide-react";

function formatCampaignLocations(locations: string[]): string {
  const [first] = locations;
  if (!first) return "No locations";
  if (locations.length === 1) return first;
  return `${first} + ${locations.length - 1} more`;
}

interface CampaignCardListProps {
  campaigns: Array<{
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
  }>;
  showOrg?: boolean;
}

function CampaignStatusBadge({ status }: { status: string }) {
  const statusConfig = {
    ACTIVE: {
      bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      dot: "bg-green-600",
      label: "active",
    },
    DRAFT: {
      bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      dot: "bg-blue-600",
      label: "draft",
    },
    COMPLETED: {
      bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
      dot: "bg-gray-500",
      label: "completed",
    },
  };

  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${config.bg}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${config.dot}`}></span>
      {config.label}
    </span>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function CampaignCardList({
  campaigns,
  showOrg = true,
}: CampaignCardListProps) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {campaigns.map((campaign) => (
        <div
          key={campaign.id}
          onClick={() => router.push(`/campaigns/${campaign.id}`)}
          className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors cursor-pointer"
        >
          {/* Top Row */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-foreground">
                {campaign.name}
              </h3>
            </div>
            <div>
              <CampaignStatusBadge status={campaign.status} />
            </div>
          </div>

          {/* Middle Row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-4">
            {campaign.startDate && campaign.endDate && (
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                <span>
                  {new Date(campaign.startDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  -{" "}
                  {new Date(campaign.endDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
            {showOrg && campaign.org && (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>{campaign.org.name}</span>
              </div>
            )}
            {campaign.locations && campaign.locations.length > 0 && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>{formatCampaignLocations(campaign.locations)}</span>
              </div>
            )}
          </div>

          {/* Bottom Row */}
          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground leading-none">
                    {formatCompact(campaign._count.events)}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                    Events
                  </span>
                </div>
              </div>
              <div className="w-px h-8 bg-border"></div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground leading-none">
                    {formatCompact(campaign.totalBands ?? 0)}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                    Bands
                  </span>
                </div>
              </div>
              <div className="w-px h-8 bg-border"></div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground leading-none">
                    {campaign.aggregateEngagement ?? 0}%
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                    Engagement
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/campaigns/${campaign.id}`); }}
              className="hidden md:block px-3 py-1.5 text-xs font-medium text-primary border border-border rounded-md hover:bg-muted transition-colors"
            >
              View Campaign Details
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
