import { db, Prisma, CampaignStatus } from "@sparkmotion/database";
import { getEventEngagement, aggregateCampaignEngagement } from "@sparkmotion/api";
import { CampaignCardList } from "@/components/campaigns/campaign-card-list";
import { CampaignPageActions } from "@/components/campaigns/campaign-page-actions";
import { ListFilterBar } from "@/components/list-filter-bar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const CAMPAIGN_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
];

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { search?: string; status?: string; page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const search = searchParams.search?.trim() || "";
  const status = searchParams.status;

  const where: Prisma.CampaignWhereInput = {
    deletedAt: null,
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    ...(status && status in CampaignStatus ? { status: status as CampaignStatus } : {}),
  };

  const [campaigns, totalCount] = await Promise.all([
    db.campaign.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        org: { select: { name: true } },
        events: {
          where: { status: { in: ["ACTIVE", "COMPLETED"] }, deletedAt: null },
          select: { id: true, location: true, _count: { select: { bands: { where: { deletedAt: null } } } } },
        },
        _count: {
          select: {
            events: { where: { status: { in: ["ACTIVE", "COMPLETED"] }, deletedAt: null } },
          },
        },
      },
    }),
    db.campaign.count({ where }),
  ]);

  // Batch query window-based engagement for all campaign events
  const allEventIds = campaigns.flatMap((c) => c.events.map((e) => e.id));
  const bandCountByEvent = new Map(
    campaigns.flatMap((c) => c.events.map((e) => [e.id, e._count.bands] as const))
  );
  const engagementMap = await getEventEngagement(allEventIds, bandCountByEvent);

  const campaignsWithStats = campaigns.map((campaign) => {
    const { aggregateEngagement, totalBands } = aggregateCampaignEngagement(
      campaign.events,
      engagementMap,
    );
    const locations = campaign.events
      .map((e) => e.location)
      .filter((loc): loc is string => !!loc);
    return { ...campaign, aggregateEngagement, totalBands, locations };
  });

  const orgs = await db.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const events = await db.event.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, campaign: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Campaigns
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor all campaigns
          </p>
        </div>
        <CampaignPageActions orgs={orgs} availableEvents={events} />
      </div>

      {/* Search, Status Filter & Pagination */}
      <div className="mb-6">
        <ListFilterBar
          statusOptions={CAMPAIGN_STATUS_OPTIONS}
          totalItems={totalCount}
          pageSize={PAGE_SIZE}
          currentPage={page}
          searchPlaceholder="Search campaigns..."
        />
      </div>

      {/* Campaigns List or Empty State */}
      {campaignsWithStats.length > 0 ? (
        <CampaignCardList campaigns={campaignsWithStats} showOrg={true} />
      ) : (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">No campaigns found</p>
          <CampaignPageActions orgs={orgs} availableEvents={events} />
        </div>
      )}
    </div>
  );
}
