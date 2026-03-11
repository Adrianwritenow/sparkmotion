import { Activity, Building2, Calendar, Users } from "lucide-react";

import { RecentEventsTable } from "@sparkmotion/ui/dashboard";
import { RecentOrgs } from "@/components/dashboard/recent-orgs";
import { CurrentDate, StatCard } from "@sparkmotion/ui";
import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const userName = session?.user?.name || "Admin";

  const [
    orgCount,
    eventCount,
    activeEventCount,
    bandCount,
    recentEvents,
    recentOrgs,
  ] = await db.$transaction([
    db.organization.count({ where: { deletedAt: null } }),
    db.event.count({ where: { deletedAt: null } }),
    db.event.count({ where: { status: "ACTIVE", deletedAt: null } }),
    db.band.count({ where: { deletedAt: null } }),
    db.event.findMany({
      where: { deletedAt: null },
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: { org: { select: { name: true } } },
    }),
    db.organization.findMany({
      where: { deletedAt: null },
      take: 4,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { events: { where: { deletedAt: null } } } } },
    }),
  ]);

  const statusLabel: Record<string, string> = {
    ACTIVE: "Active",
    DRAFT: "Draft",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };

  const eventsData = recentEvents.map((event) => ({
    id: event.id,
    name: event.name,
    orgName: event.org.name,
    status: statusLabel[event.status] ?? event.status,
    updatedAt: event.updatedAt,
  }));

  const orgsData = recentOrgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    eventCount: org._count.events,
  }));

  return (
    <div className="flex-1 bg-background rounded-xl overflow-y-auto h-full">
      <div className="mx-auto min-h-full p-6 md:p-8">
        {/* Welcome Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {userName}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s what&apos;s happening across your organizations today,{" "}
            <CurrentDate />.
          </p>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6 md:mb-8">
          <StatCard
            title="Total Organizations"
            value={orgCount}
            icon={Building2}
            color="blue"
          />

          <StatCard
            title="Total Events"
            value={eventCount}
            icon={Calendar}
            color="purple"
          />

          <StatCard
            title="Active Events"
            value={activeEventCount}
            icon={Activity}
            color="green"
          />

          <StatCard
            title="Total Bands"
            value={bandCount}
            icon={Users}
            color="orange"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
          {/* Left Column - Activity */}
          <div className="xl:col-span-2 space-y-8">
            <RecentEventsTable events={eventsData} showOrgColumn />
          </div>

          {/* Right Column - Organizations */}
          <div className="space-y-8">
            <RecentOrgs orgs={orgsData} />
          </div>
        </div>
      </div>
    </div>
  );
}
