import { db } from "@sparkmotion/database";
import { notFound } from "next/navigation";
import { Building2, Calendar, MapPin } from "lucide-react";
import { BackButton } from "@sparkmotion/ui";
import { EventDetailTabs } from "@sparkmotion/ui/events";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string; from?: string; campaignId?: string };
}) {
  const event = await db.event.findUnique({
    where: { id: params.id, deletedAt: null },
    include: {
      org: { select: { name: true } },
      windows: { orderBy: { startTime: "asc" } },
      campaign: { select: { id: true, name: true } },
      _count: { select: { bands: { where: { deletedAt: null } } } },
    },
  });

  if (!event) {
    notFound();
  }

  const campaigns = await db.campaign.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const recentTransition = await db.changeLog.findFirst({
    where: {
      resourceId: params.id,
      action: { startsWith: "event.autoLifecycle." },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: { action: true, createdAt: true },
  });

  const activeTab = searchParams.tab || "overview";
  const fromCampaign = searchParams.from === "campaign" && searchParams.campaignId;
  const backLabel = fromCampaign ? "Back to Campaign Events" : "Back to Events";
  const backHref = fromCampaign ? `/campaigns/${searchParams.campaignId}?tab=events` : "/events";

  // Status badge component
  const statusConfig = {
    ACTIVE: {
      bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      label: "active",
    },
    DRAFT: {
      bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      label: "upcoming",
    },
    COMPLETED: {
      bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
      label: "completed",
    },
    CANCELLED: {
      bg: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      label: "cancelled",
    },
  } as const;

  type StatusKey = keyof typeof statusConfig;
  const statusKey: StatusKey =
    event.status && event.status in statusConfig
      ? (event.status as StatusKey)
      : "DRAFT";
  const statusStyle = statusConfig[statusKey];

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <BackButton label={backLabel} fallbackHref={backHref} />

      {/* Event Header */}
      <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground">
              {event.name}
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${statusStyle.bg}`}
            >
              {statusStyle.label}
            </span>
          </div>
          <span className="text-xs font-mono text-muted-foreground/60">ID: {event.id}</span>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4" />
              <span>{event.org?.name || "No Organization"}</span>
            </div>
            {(event.venueName || event.city) && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                <span>
                  {[event.venueName, [event.city, event.state].filter(Boolean).join(", ")].filter(Boolean).join(" - ")}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>
                {event.startDate && event.endDate ? (
                  `${new Date(event.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} - ${new Date(event.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
                ) : event.startDate ? (
                  new Date(event.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
                ) : (() => {
                  const firstWindow = event.windows.find((w) => w.startTime);
                  return firstWindow?.startTime
                    ? new Date(firstWindow.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
                    : "-";
                })()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Component */}
      <EventDetailTabs
        event={{
          ...event,
          latitude: event.latitude ? Number(event.latitude) : null,
          longitude: event.longitude ? Number(event.longitude) : null,
        }}
        activeTab={activeTab}
        campaigns={campaigns}
        recentTransition={recentTransition}
      />
    </div>
  );
}
