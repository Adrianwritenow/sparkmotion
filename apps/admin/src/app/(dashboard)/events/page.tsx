import { db, Prisma, EventStatus } from "@sparkmotion/database";
import { getEventEngagement } from "@sparkmotion/api";
import { EventListWithActions } from "@/components/events/event-list-with-actions";
import { CampaignFilter } from "@/components/events/campaign-filter";
import { EventPageActions } from "@/components/events/event-page-actions";
import { ListFilterBar } from "@/components/list-filter-bar";

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
  const campaigns = await db.campaign.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const orgs = await db.organization.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const page = Math.max(1, Number(searchParams.page) || 1);
  const search = searchParams.search?.trim() || "";
  const status = searchParams.status;

  const where: Prisma.EventWhereInput = {
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
        org: { select: { name: true } },
        campaign: { select: { id: true, name: true } },
        _count: { select: { bands: true } },
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
          <EventPageActions orgs={orgs} campaigns={campaigns} />
        </div>
      </div>

      {/* Campaign Filter */}
      {campaigns.length > 0 && (
        <div className="mb-6">
          <CampaignFilter
            campaigns={campaigns}
            selected={searchParams.campaignId}
          />
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
        <EventListWithActions events={eventsWithStats} showOrg={true} showCampaign={true} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No events found</p>
        </div>
      )}
    </div>
  );
}
