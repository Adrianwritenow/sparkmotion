"use client";

import { useState } from "react";
import { subDays, endOfDay, formatISO, startOfDay } from "date-fns";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { KpiCards } from "@/components/analytics/kpi-cards";
import { TapTrendChart } from "@/components/analytics/tap-trend-chart";
import { TopEventsTable } from "@/components/analytics/top-events-table";

export default function AnalyticsPage() {
  // Default to last 7 days
  const [from, setFrom] = useState(() => formatISO(subDays(startOfDay(new Date()), 7)));
  const [to, setTo] = useState(() => formatISO(endOfDay(new Date())));

  const handleRangeChange = (newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Analytics</h2>
        <DateRangeFilter from={from} to={to} onRangeChange={handleRangeChange} />
      </div>

      <KpiCards from={from} to={to} />

      <div className="grid gap-6 lg:grid-cols-2">
        <TapTrendChart from={from} to={to} />
        <TopEventsTable from={from} to={to} />
      </div>
    </div>
  );
}
