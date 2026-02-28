import { db, Prisma } from "@sparkmotion/database";
import { getEventEngagement } from "@sparkmotion/api";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Calendar, Mail, Link2 } from "lucide-react";
import { MembersTable } from "@/components/organizations/members-table";
import { EventCardList } from "@/components/events/event-card-list";
import { OrgSettingsForm } from "@/components/organizations/org-settings-form";
import { OrgHeaderActions } from "@/components/organizations/org-header-actions";
import { OrgOverviewAnalytics } from "@/components/organizations/org-overview-analytics";

export const dynamic = "force-dynamic";

type Props = {
  params: { id: string };
  searchParams: { tab?: string };
};

export default async function OrganizationDetailPage({ params, searchParams }: Props) {
  const org = await db.organization.findUnique({
    where: { id: params.id, deletedAt: null },
    include: {
      _count: {
        select: {
          events: { where: { deletedAt: null } },
          users: true,
        },
      },
      events: {
        where: { deletedAt: null },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          campaign: { select: { id: true, name: true } },
          _count: { select: { bands: { where: { deletedAt: null } } } },
        },
      },
    },
  });

  if (!org) {
    notFound();
  }

  // Batch query tap stats + window-based engagement for org events
  const eventIds = org.events.map((e) => e.id);
  const bandCountByEvent = new Map(org.events.map((e) => [e.id, e._count.bands]));

  const [tapStats, engagementMap] = await Promise.all([
    eventIds.length > 0
      ? db.$queryRaw<Array<{ eventId: string; total_taps: bigint }>>(Prisma.sql`
          SELECT "eventId", COUNT(*)::int AS total_taps
          FROM "TapLog"
          WHERE "eventId" IN (${Prisma.join(eventIds)})
          GROUP BY "eventId"
        `)
      : [],
    getEventEngagement(eventIds, bandCountByEvent),
  ]);
  const tapStatsMap = new Map(tapStats.map((s) => [s.eventId, Number(s.total_taps)]));

  const eventsWithStats = org.events.map((event) => {
    const tapCount = tapStatsMap.get(event.id) ?? 0;
    const engagementPercent = engagementMap.get(event.id)?.engagementPercent ?? 0;
    return { ...event, tapCount, engagementPercent };
  });

  const activeTab = searchParams.tab || "overview";

  // Generate org initials for avatar
  const initials = org.name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-8">
      {/* Back Button */}
      <Link
        href="/organizations"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Organizations
      </Link>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl font-bold shadow-sm">
            {initials}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {org.name}
            </h1>
            <span className="text-xs font-mono text-muted-foreground/60">ID: {org.id}</span>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Globe className="w-4 h-4" />
                <span>{org.slug || "no-slug"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>
                  Joined {new Date(org.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
          </div>
        </div>
        <OrgHeaderActions orgId={org.id} orgName={org.name} contactEmail={org.contactEmail} />
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-border">
        <nav className="flex gap-6">
          {["overview", "events", "analytics", "members", "settings"].map((tab) => (
            <Link
              key={tab}
              href={`/organizations/${params.id}?tab=${tab}`}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
            >
              {tab}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <div className="bg-card border border-border rounded-lg p-6">
                  <h3 className="font-semibold text-foreground mb-4">
                    About Organization
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {org.name} has been active since{" "}
                    {new Date(org.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}{" "}
                    and currently has {org._count.events} active events.
                    Slug: {org.slug || "Not configured"}.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-card border border-border rounded-lg p-6">
                  <h3 className="font-semibold text-foreground mb-4">
                    Contact Info
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">Email</div>
                        <div className="text-sm text-muted-foreground">
                          {org.contactEmail ? (
                            <a
                              href={`mailto:${org.contactEmail}`}
                              className="text-primary hover:underline"
                            >
                              {org.contactEmail}
                            </a>
                          ) : (
                            "Not configured"
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">Slug</div>
                        <div className="text-sm text-muted-foreground">
                          {org.slug || "Not configured"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Link2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">Website</div>
                        <div className="text-sm text-muted-foreground">
                          {org.websiteUrl ? (
                            <a
                              href={org.websiteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {org.websiteUrl}
                            </a>
                          ) : (
                            "Not configured"
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === "events" && (
          eventsWithStats.length > 0 ? (
            <EventCardList events={eventsWithStats} showOrg={false} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-foreground">
                No Events Yet
              </h3>
              <p>No events have been created for {org.name}.</p>
            </div>
          )
        )}

        {activeTab === "analytics" && (
          <OrgOverviewAnalytics
            orgId={org.id}
            orgName={org.name}
            events={org.events.map((e) => ({ id: e.id, name: e.name }))}
          />
        )}

        {activeTab === "members" && <MembersTable orgId={org.id} />}

        {activeTab === "settings" && (
          <OrgSettingsForm orgId={org.id} name={org.name} slug={org.slug} websiteUrl={org.websiteUrl} contactEmail={org.contactEmail} />
        )}
      </div>
    </div>
  );
}
