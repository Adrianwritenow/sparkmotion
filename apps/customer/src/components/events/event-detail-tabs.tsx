"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { EventEditForm } from "./event-edit-form";
import { EventSettings } from "./event-settings";
import { WindowsList } from "./windows-list";
import { EventsAnalytics } from "./events-analytics";
import { BandsTable } from "../bands/bands-table";
import { BandCsvUpload } from "../bands/band-csv-upload";
import type { Event } from "@sparkmotion/database";

interface EventDetailTabsProps {
  event: Omit<Event, "latitude" | "longitude"> & {
    latitude: number | null;
    longitude: number | null;
    org?: { name: string } | null;
    _count: { bands: number };
    campaign?: { id: string; name: string } | null;
  };
  activeTab: string;
  campaigns: Array<{ id: string; name: string }>;
}

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "bands", label: "Bands" },
  { id: "url-manager", label: "URL Manager" },
  { id: "analytics", label: "Analytics" },
  { id: "settings", label: "Settings" },
];

export function EventDetailTabs({ event, activeTab, campaigns }: EventDetailTabsProps) {
  const router = useRouter();

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
            {event.campaign && (
              <div className="mb-6 pb-6 border-b border-border">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Megaphone className="w-4 h-4" />
                  <span>Campaign:</span>
                  <Link
                    href={`/campaigns/${event.campaign.id}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {event.campaign.name}
                  </Link>
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
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {event._count.bands} {event._count.bands === 1 ? 'Band' : 'Bands'}
              </h3>
              <BandCsvUpload eventId={event.id} />
            </div>
            <BandsTable eventId={event.id} />
          </div>
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
            />
          </div>
        )}

        {activeTab === "settings" && (
          <EventSettings event={event} />
        )}
      </div>
    </>
  );
}
