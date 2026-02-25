import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";
import { redirect } from "next/navigation";
import { Calendar, Activity, Users } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentEventsTable } from "@/components/dashboard/recent-events-table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.orgId) {
    redirect("/auth/signin");
  }

  const orgId = session.user.orgId;
  const userName = session?.user?.name || "Customer";

  const [org, eventCount, activeEventCount, bandCount, recentEvents] =
    await db.$transaction([
      db.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      }),
      db.event.count({ where: { orgId } }),
      db.event.count({ where: { orgId, status: "ACTIVE" } }),
      db.band.count({
        where: {
          event: {
            orgId,
          },
        },
      }),
      db.event.findMany({
        where: { orgId },
        take: 5,
        orderBy: { updatedAt: "desc" },
      }),
    ]);

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const orgName = org?.name || "your organization";

  const statusLabel: Record<string, string> = {
    ACTIVE: "Active",
    DRAFT: "Draft",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
  };

  const eventsData = recentEvents.map((event) => ({
    id: event.id,
    name: event.name,
    status: statusLabel[event.status] ?? event.status,
    updatedAt: event.updatedAt,
  }));

  return (
    <div className="flex-1 bg-background rounded-xl border border-border shadow-sm overflow-y-auto h-full">
      <div className="max-w-[1600px] mx-auto min-h-full p-6 md:p-8">
        {/* Welcome Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {userName}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s what&apos;s happening at {orgName} today, {currentDate}.
          </p>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 md:mb-8">
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

        {/* Recent Events Table */}
        <div className="mb-8">
          <RecentEventsTable events={eventsData} />
        </div>
      </div>
    </div>
  );
}
