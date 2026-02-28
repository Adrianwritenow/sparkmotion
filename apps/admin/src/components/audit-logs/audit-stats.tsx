"use client";

import { Activity, ShieldAlert, Trash2, UserCheck } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsData {
  totalEvents24h: number;
  failedLogins7d: number;
  deletions7d: number;
  mostActiveUser: { name: string | null; email: string; count: number } | null;
}

interface AuditStatsProps {
  stats: StatsData | undefined;
  isLoading: boolean;
}

export function AuditStats({ stats, isLoading }: AuditStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
    );
  }

  const mostActiveUserValue =
    stats?.mostActiveUser?.name ??
    stats?.mostActiveUser?.email ??
    "—";

  const mostActiveUserChange = stats?.mostActiveUser
    ? `${stats.mostActiveUser.count} actions`
    : undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Events (24h)"
        value={stats?.totalEvents24h ?? 0}
        icon={Activity}
        color="blue"
      />
      <StatCard
        title="Failed Logins (7d)"
        value={stats?.failedLogins7d ?? 0}
        icon={ShieldAlert}
        color="orange"
      />
      <StatCard
        title="Deletions (7d)"
        value={stats?.deletions7d ?? 0}
        icon={Trash2}
        color="purple"
      />
      <StatCard
        title="Most Active User"
        value={mostActiveUserValue}
        change={mostActiveUserChange}
        icon={UserCheck}
        color="green"
      />
    </div>
  );
}
