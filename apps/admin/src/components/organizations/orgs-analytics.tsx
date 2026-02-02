"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatISO, subDays, startOfDay, endOfDay } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { KpiCards } from "@/components/analytics/kpi-cards";
import { TapTrendChart } from "@/components/analytics/tap-trend-chart";
import { TopOrgsTable } from "@/components/analytics/top-orgs-table";
import { TopEventsTable } from "@/components/analytics/top-events-table";

const now = new Date();
const defaultFrom = formatISO(subDays(startOfDay(now), 7));
const defaultTo = formatISO(endOfDay(now));

export function OrgsAnalytics() {
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(
    undefined
  );
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const { data: orgs } = trpc.organizations.list.useQuery();

  const handleRangeChange = (newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
  };

  const handleOrgChange = (value: string) => {
    setSelectedOrgId(value === "all" ? undefined : value);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select
          value={selectedOrgId ?? "all"}
          onValueChange={handleOrgChange}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Organizations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Organizations</SelectItem>
            {orgs?.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter from={from} to={to} onRangeChange={handleRangeChange} />
      </div>

      <KpiCards from={from} to={to} orgId={selectedOrgId} />

      <div className="grid gap-4 md:grid-cols-2">
        <TapTrendChart from={from} to={to} orgId={selectedOrgId} />
        {selectedOrgId ? (
          <TopEventsTable from={from} to={to} />
        ) : (
          <TopOrgsTable from={from} to={to} />
        )}
      </div>
    </div>
  );
}
