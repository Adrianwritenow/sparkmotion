import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";
import { getEventEngagement } from "@sparkmotion/api";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { CampaignDetailTabs } from "@/components/campaigns/campaign-detail-tabs";

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const session = await auth();

  if (!session?.user?.orgId) {
    redirect("/signin");
  }

  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    include: {
      org: { select: { name: true } },
      events: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { bands: true } },
        },
      },
      _count: { select: { events: true } },
    },
  });

  if (!campaign) {
    notFound();
  }

  const campaigns = await db.campaign.findMany({
    where: { orgId: session.user.orgId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Verify org ownership
  if (campaign.orgId !== session.user.orgId) {
    notFound();
  }

  // Enrich events with engagement stats (only ACTIVE/COMPLETED contribute)
  const analyticsEvents = campaign.events.filter(
    (e) => e.status === "ACTIVE" || e.status === "COMPLETED"
  );
  const eventIds = analyticsEvents.map((e) => e.id);
  const bandCountByEvent = new Map(analyticsEvents.map((e) => [e.id, e._count.bands]));
  const engagementMap = await getEventEngagement(eventIds, bandCountByEvent);

  const eventsWithStats = campaign.events.map((event) => {
    const eng = engagementMap.get(event.id);
    return {
      ...event,
      tapCount: eng?.totalTaps ?? 0,
      engagementPercent: eng?.engagementPercent ?? 0,
    };
  });

  const campaignWithStats = { ...campaign, events: eventsWithStats };

  const activeTab = searchParams.tab || "overview";

  // Status badge component
  const statusConfig = {
    ACTIVE: {
      bg: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      label: "active",
    },
    DRAFT: {
      bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      label: "draft",
    },
    COMPLETED: {
      bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
      label: "completed",
    },
  } as const;

  type StatusKey = keyof typeof statusConfig;
  const statusKey: StatusKey =
    campaign.status && campaign.status in statusConfig
      ? (campaign.status as StatusKey)
      : "DRAFT";
  const statusStyle = statusConfig[statusKey];

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/campaigns"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaigns
      </Link>

      {/* Campaign Header */}
      <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground">
              {campaign.name}
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${statusStyle.bg}`}
            >
              {statusStyle.label}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {campaign.startDate && campaign.endDate && (
              <div className="flex items-center gap-1.5">
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
            <div className="flex items-center gap-1.5">
              <span>{campaign._count.events} event(s)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Component */}
      <CampaignDetailTabs campaign={campaignWithStats} activeTab={activeTab} campaigns={campaigns} orgName={campaign.org?.name ?? ""} />
    </div>
  );
}
