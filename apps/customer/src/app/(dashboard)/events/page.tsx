import { auth } from "@sparkmotion/auth";
import { db, Prisma, EventStatus } from "@sparkmotion/database";
import { getEventEngagement } from "@sparkmotion/api";
import { EventListWithActions } from "@/components/events/event-list-with-actions";
import { CampaignFilter } from "@/components/events/campaign-filter";
import { EventPageActions } from "@/components/events/event-page-actions";
import { ListFilterBar } from "@/components/list-filter-bar";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const EVENT_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function EventsPage({
  searchParams,
}: {
  searchParams: { campaignId?: string; search?: string; status?: string; page?: string };
}) {
  const session = await auth();

  if (!session?.user?.orgId) {
    redirect("/signin");
  }

  const page = Math.max(1, Number(searchParams.page) || 1);
  const search = searchParams.search?.trim() || "";
  const status = searchParams.status;

  const [org, campaigns] = await Promise.all([
    db.organization.findUnique({
      where: { id: session.user.orgId, deletedAt: null },
      select: { name: true },
    }),
    db.campaign.findMany({
      where: { orgId: session.user.orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const orgName = org?.name ?? "";

  const where: Prisma.EventWhereInput = {
    orgId: session.user.orgId,
    deletedAt: null,
    ...(searchParams.campaignId ? { campaignId: searchParams.campaignId } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    ...(status && status in EventStatus ? { status: status as EventStatus } : {}),
  };

  const [events, totalCount] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { bands: { where: { deletedAt: null } } } },
        campaign: { select: { id: true, name: true } },
      },
    }),
    db.event.count({ where }),
  ]);

  // Batch engagement + tap stats via shared lib
  const eventIds = events.map((e) => e.id);
  const bandCountByEvent = new Map(events.map((e) => [e.id, e._count.bands]));
  const engagementMap = await getEventEngagement(eventIds, bandCountByEvent);

  const eventsWithStats = events.map((event) => {
    const eng = engagementMap.get(event.id);
    const tapCount = eng?.totalTaps ?? 0;
    const engagementPercent = eng?.engagementPercent ?? 0;
    return { ...event, tapCount, engagementPercent };
  });

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Events
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor all events
          </p>
        </div>
        <div className="flex gap-2">
          <EventPageActions orgId={session.user.orgId} campaigns={campaigns} />
        </div>
      </div>

      {/* Campaign Filter */}
      {campaigns.length > 0 && (
        <div className="mb-6">
          <CampaignFilter campaigns={campaigns} selected={searchParams.campaignId} />
        </div>
      )}

      {/* Search, Status Filter & Pagination */}
      <div className="mb-6">
        <ListFilterBar
          statusOptions={EVENT_STATUS_OPTIONS}
          totalItems={totalCount}
          pageSize={PAGE_SIZE}
          currentPage={page}
          searchPlaceholder="Search events..."
        />
      </div>

      {/* Events Card List */}
      {eventsWithStats.length > 0 ? (
        <EventListWithActions events={eventsWithStats} showOrg={false} showCampaign={true} orgName={orgName} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">No events found</h3>
            <p className="text-sm text-muted-foreground">
              {search || status ? "Try adjusting your filters" : "Get started by creating your first event"}
            </p>
            {!search && !status && (
              <EventPageActions orgId={session.user.orgId} campaigns={campaigns} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
