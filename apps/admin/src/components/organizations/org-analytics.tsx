"use client";

import { useState, useRef } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { KpiCards } from "@/components/analytics/kpi-cards";
import { TapTrendChart } from "@/components/analytics/tap-trend-chart";
import { TopEventsTable } from "@/components/analytics/top-events-table";
import { ModeSplitChart } from "@/components/analytics/mode-split-chart";
import { WindowSplitChart } from "@/components/analytics/window-split-chart";
import { ExportCsvButton } from "@/components/analytics/export-csv-button";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrgAnalyticsProps {
  orgId: string;
  events: Array<{ id: string; name: string }>;
}

export function OrgAnalytics({ orgId, events }: OrgAnalyticsProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();
  const [selectedWindowId, setSelectedWindowId] = useState<string | undefined>();

  // Fetch windows when an event is selected
  const { data: windows } = trpc.windows.list.useQuery(
    { eventId: selectedEventId! },
    { enabled: !!selectedEventId }
  );

  // Derive ISO strings using local date parts to avoid timezone shift
  // (e.g. Feb 1 00:00 CST → Jan 31 UTC when using toISOString())
  const from = dateRange?.from
    ? format(dateRange.from, "yyyy-MM-dd'T'00:00:00.000'Z'")
    : "2020-01-01T00:00:00.000Z";
  const to = dateRange?.to
    ? format(dateRange.to, "yyyy-MM-dd'T'23:59:59.999'Z'")
    : format(new Date(), "yyyy-MM-dd'T'23:59:59.999'Z'");

  const handleEventChange = (value: string) => {
    const eventId = value === "all" ? undefined : value;
    setSelectedEventId(eventId);
    setSelectedWindowId(undefined);
  };

  const handleWindowChange = (value: string) => {
    setSelectedWindowId(value === "all" ? undefined : value);
  };

  const clearFilters = () => {
    setSelectedEventId(undefined);
    setSelectedWindowId(undefined);
    setDateRange(undefined);
  };

  const hasActiveFilters = !!selectedEventId || !!selectedWindowId;

  return (
    <div className="space-y-6" ref={captureRef}>
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date range picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal",
                !dateRange && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "LLL dd, y")} -{" "}
                    {format(dateRange.to, "LLL dd, y")}
                  </>
                ) : (
                  format(dateRange.from, "LLL dd, y")
                )
              ) : (
                "Date range"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        <Select value={selectedEventId ?? "all"} onValueChange={handleEventChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Events</SelectItem>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedEventId && windows && windows.length > 0 && (
          <Select value={selectedWindowId ?? "all"} onValueChange={handleWindowChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Windows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Windows</SelectItem>
              {windows.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.title || `${w.windowType}${w.startTime ? ` - ${new Date(w.startTime).toLocaleDateString()}` : ""}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="w-4 h-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <KpiCards from={from} to={to} orgId={orgId} eventId={selectedEventId} />

      {/* Charts Grid */}
      <div className={cn("grid gap-6", selectedEventId ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        <TapTrendChart from={from} to={to} orgId={orgId} eventId={selectedEventId} />
        <ModeSplitChart from={from} to={to} orgId={orgId} eventId={selectedEventId} />
        {selectedEventId && (
          <WindowSplitChart eventId={selectedEventId} from={from} to={to} />
        )}
      </div>

      {!selectedEventId && (
        <TopEventsTable from={from} to={to} orgId={orgId} />
      )}

      {/* Export */}
      <div className="flex justify-end">
        <ExportCsvButton from={from} to={to} eventId={selectedEventId} captureRef={captureRef} />
      </div>
    </div>
  );
}
