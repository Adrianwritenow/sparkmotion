"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EventEditForm } from "./event-edit-form";
import { EventSettings } from "./event-settings";
import { WindowsList } from "./windows-list";
import { EventsAnalytics } from "./events-analytics";
import { Megaphone, Copy, Check, X } from "lucide-react";
import type { Event } from "@sparkmotion/database";

interface EventDetailTabsProps {
  event: Omit<Event, "latitude" | "longitude"> & {
    latitude: number | null;
    longitude: number | null;
    org?: { name: string } | null;
    campaign?: { id: string; name: string } | null;
    campaignId?: string | null;
    _count: { bands: number };
    windows?: Array<{ startTime?: Date | null; endTime?: Date | null }>;
  };
  activeTab: string;
  campaigns: Array<{ id: string; name: string }>;
  recentTransition?: { action: string; createdAt: Date } | null;
  /** Render the Bands tab content (app-specific — passes app-local band components) */
  renderBandsTab?: () => React.ReactNode;
  /** Admin: show the sample redirect URL section in the overview tab */
  showSampleUrl?: boolean;
  /** Admin: extra sections to render in EventSettings (e.g. Clean Up Analytics) */
  extraSettingsSections?: React.ReactNode;
}

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "bands", label: "Bands" },
  { id: "url-manager", label: "URL Manager" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

export function EventDetailTabs({
  event,
  activeTab,
  campaigns,
  recentTransition,
  renderBandsTab,
  showSampleUrl = false,
  extraSettingsSections,
}: EventDetailTabsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [transitionDismissed, setTransitionDismissed] = useState(false);

  const sampleRedirectUrl = `https://${process.env.NEXT_PUBLIC_SPARK_MOTION_URL || "sparkmotion.net"}/e?bandId=****&eventId=${event.id}&orgId=${event.orgId}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sampleRedirectUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTabChange = (tabId: string) => {
    router.push(`/events/${event.id}?tab=${tabId}`, { scroll: false });
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
            {recentTransition && !transitionDismissed && (
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Auto-lifecycle: Status changed to{" "}
                  <strong>
                    {recentTransition.action.includes("draft_to_active") ? "ACTIVE" : "COMPLETED"}
                  </strong>{" "}
                  at{" "}
                  {new Date(recentTransition.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <button
                  onClick={() => setTransitionDismissed(true)}
                  className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 ml-4"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {event.campaign && (
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Megaphone className="w-4 h-4" />
                <span>Campaign:</span>
                <Link
                  href={`/campaigns/${event.campaign.id}`}
                  className="text-primary hover:underline font-medium"
                >
                  {event.campaign.name}
                </Link>
              </div>
            )}
            {showSampleUrl && (
              <div className="mb-4 space-y-1">
                <label className="text-sm font-medium text-muted-foreground">Sample Redirect URL</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={sampleRedirectUrl}
                    className="flex-1 px-3 py-2 text-sm font-mono bg-muted border border-border rounded-md text-muted-foreground cursor-default"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-2 border border-border rounded-md hover:bg-muted transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
            )}
            <h3 className="font-semibold text-foreground mb-6">
              Event Information
            </h3>
            <EventEditForm event={event} campaigns={campaigns} />
          </div>
        )}

        {activeTab === "bands" && (
          renderBandsTab ? renderBandsTab() : null
        )}

        {activeTab === "url-manager" && (
          <div className="space-y-6">
            <WindowsList eventId={event.id} />
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-6">
            <EventsAnalytics
              eventId={event.id}
              eventName={event.name}
              orgName={event.org?.name ?? ""}
              estimatedAttendees={event.estimatedAttendees ?? null}
              eventTimezone={event.timezone}
            />
          </div>
        )}

        {activeTab === "settings" && (
          <EventSettings
            event={{
              ...event,
              autoLifecycle: (event as any).autoLifecycle ?? false,
              campaignId: event.campaignId ?? null,
              startDate: event.startDate ?? null,
              endDate: event.endDate ?? null,
              hasWindowsWithTimes: (event as any).windows?.some(
                (w: any) => w.startTime && w.endTime
              ) ?? false,
            }}
            extraSections={extraSettingsSections}
          />
        )}
      </div>
    </>
  );
}
