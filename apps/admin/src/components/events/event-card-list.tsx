"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Building2,
  Users,
  MousePointerClick,
  Megaphone,
  MapPin,
  TrendingUp,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface EventCardListProps {
  events: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    location?: string | null;
    venueName?: string | null;
    formattedAddress?: string | null;
    city?: string | null;
    state?: string | null;
    org?: { name: string } | null;
    campaign?: { id: string; name: string } | null;
    windows?: Array<{ isActive: boolean }>;
    _count: { bands: number };
    tapCount?: number;
    engagementPercent?: number;
  }>;
  showOrg?: boolean;
  showCampaign?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (id: string) => void;
}

function StatusBadge({ status }: { status: string }) {
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
    CANCELLED: {
      bg: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      dot: "bg-red-600",
      label: "cancelled",
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT;

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

export function EventCardList({ events, showOrg = true, showCampaign = false, selectable = false, selectedIds, onSelectionChange }: EventCardListProps) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {events.map((event) => {
        const isLive = event.windows?.some((w: any) => w.isActive) ?? false;
        const isSelected = selectable && selectedIds?.has(event.id);

        return (
        <div key={event.id} className="flex items-start gap-3">
          {selectable && (
            <div className="pt-5">
              <Checkbox
                checked={!!isSelected}
                onCheckedChange={() => onSelectionChange?.(event.id)}
              />
            </div>
          )}
          <div
            onClick={() => router.push(`/events/${event.id}`)}
            className={`flex-1 bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors cursor-pointer ${isSelected ? "ring-2 ring-primary" : ""}`}
          >
          {/* Top Row */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold text-foreground">
                {event.name}
              </h3>
              {isLive && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </div>
            <div>
              <StatusBadge status={event.status} />
            </div>
          </div>

          {/* Middle Row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              <span>
                {new Date(event.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            {showOrg && event.org && (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>{event.org.name}</span>
              </div>
            )}
            {(event.venueName || event.city) && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 shrink-0" />
                <span>
                  {[event.venueName, [event.city, event.state].filter(Boolean).join(", ")].filter(Boolean).join(" - ")}
                </span>
              </div>
            )}
            {showCampaign && event.campaign && (
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4" />
                <span>{event.campaign.name}</span>
              </div>
            )}
          </div>

          {/* Bottom Row */}
          <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground leading-none">
                    {formatCompact(event._count.bands)}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                    Bands
                  </span>
                </div>
              </div>
              <div className="w-px h-8 bg-border"></div>
              <div className="flex items-center gap-2">
                <MousePointerClick className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground leading-none">
                    {formatCompact(event.tapCount ?? 0)}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                    Taps
                  </span>
                </div>
              </div>
              <div className="w-px h-8 bg-border"></div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-foreground leading-none">
                    {event.engagementPercent ?? 0}%
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                    Engagement
                  </span>
                </div>
              </div>
              <div className="w-px h-8 bg-border hidden md:block"></div>
              <Link
                href={`/events/${event.id}?tab=analytics`}
                onClick={(e) => e.stopPropagation()}
                className="hidden md:inline text-xs text-primary hover:underline font-medium"
              >
                View Analytics
              </Link>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/events/${event.id}`); }}
              className="hidden md:block px-3 py-1.5 text-xs font-medium text-primary border border-border rounded-md hover:bg-muted transition-colors"
            >
              View Event Details
            </button>
          </div>
        </div>
        </div>
        );
      })}
    </div>
  );
}
