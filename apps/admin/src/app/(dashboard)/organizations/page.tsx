import { db } from "@sparkmotion/database";
import Link from "next/link";
import { Building2, Users, ArrowUpRight, MoreHorizontal, Calendar } from "lucide-react";
import { AddOrgButton } from "@/components/organizations/add-org-button";
import { ListFilterBar } from "@/components/list-filter-bar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page) || 1);
  const search = searchParams.search?.trim() || "";

  const where = search
    ? { name: { contains: search, mode: "insensitive" as const } }
    : {};

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [organizations, totalCount, orgs30DaysAgo, members30DaysAgo] = await Promise.all([
    db.organization.findMany({
      where,
      include: {
        _count: {
          select: {
            events: true,
            users: true,
          },
        },
        events: {
          where: { status: "ACTIVE" },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.organization.count({ where }),
    db.organization.count({
      where: { createdAt: { lt: thirtyDaysAgo } },
    }),
    db.user.count({
      where: { orgId: { not: null }, createdAt: { lt: thirtyDaysAgo } },
    }),
  ]);

  // Stats use unfiltered totals for platform-wide metrics
  const totalOrgs = await db.organization.count();
  const totalUsers = await db.user.count({ where: { orgId: { not: null } } });

  const orgGrowth = orgs30DaysAgo > 0
    ? ((totalOrgs - orgs30DaysAgo) / orgs30DaysAgo) * 100
    : totalOrgs > 0 ? 100 : 0;

  const memberGrowth = members30DaysAgo > 0
    ? ((totalUsers - members30DaysAgo) / members30DaysAgo) * 100
    : totalUsers > 0 ? 100 : 0;

  const avgGrowth = orgGrowth === 0 && memberGrowth === 0
    ? 0
    : (orgGrowth + memberGrowth) / 2;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Organizations
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and monitor all client organizations
          </p>
        </div>
        <AddOrgButton className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors" />
      </div>

      {/* Stats Row */}
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-muted-foreground bg-muted/50 border border-border rounded-full">
          <Calendar className="w-3 h-3" />
          30 day period
        </span>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-primary/10 rounded-md">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <GrowthBadge value={orgGrowth} />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-1">
              {totalOrgs.toLocaleString()}
            </h3>
            <p className="text-sm text-muted-foreground">Total Organizations</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-primary/10 rounded-md">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <GrowthBadge value={memberGrowth} />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-1">
              {totalUsers.toLocaleString()}
            </h3>
            <p className="text-sm text-muted-foreground">Members</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-primary/10 rounded-md">
                <ArrowUpRight className="w-4 h-4 text-primary" />
              </div>
              <GrowthBadge value={avgGrowth} />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-1">
              {avgGrowth.toFixed(1)}%
            </h3>
            <p className="text-sm text-muted-foreground">Avg. Growth</p>
          </div>
        </div>
      </div>

      {/* Search & Pagination */}
      <ListFilterBar
        totalItems={totalCount}
        pageSize={PAGE_SIZE}
        currentPage={page}
        searchPlaceholder="Search organizations..."
      />

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium">Organization</th>
                <th className="px-6 py-3 font-medium">Members</th>
                <th className="px-6 py-3 font-medium">Events</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {organizations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No organizations found
                  </td>
                </tr>
              ) : (
                organizations.map((org) => (
                  <tr
                    key={org.id}
                    className="bg-card hover:bg-muted/50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-foreground">
                          {org.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {org.slug || "no-slug"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-muted-foreground">
                        {org._count.users} {org._count.users === 1 ? "member" : "members"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {org._count.events.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      {org.events.length > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/organizations/${org.id}`}
                          className="px-3 py-1.5 text-xs font-medium text-primary border border-border rounded-md hover:bg-muted transition-colors"
                        >
                          View Details
                        </Link>
                        <button className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GrowthBadge({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
        0%
      </span>
    );
  }

  const isPositive = value > 0;
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-full ${
        isPositive
          ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30"
          : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30"
      }`}
    >
      {isPositive ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
