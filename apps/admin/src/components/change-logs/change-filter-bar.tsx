"use client";

import { CalendarDays, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays, subHours } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ChangeExportButton } from "./change-export-button";
import type { DateRange } from "react-day-picker";
import { useState } from "react";

interface ChangeFilterBarProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  userId: string | undefined;
  onUserIdChange: (id: string | undefined) => void;
  action: string | undefined;
  onActionChange: (action: string | undefined) => void;
  resource: string | undefined;
  onResourceChange: (resource: string | undefined) => void;
  users: Array<{ id: string; name: string | null; email: string }>;
  from: string | undefined;
  to: string | undefined;
}

const ACTION_OPTIONS = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "auth.login_success", label: "Login Success" },
  { value: "auth.login_failure", label: "Login Failure" },
  { value: "auth.lockout", label: "Lockout" },
];

const RESOURCE_OPTIONS = [
  "Events",
  "Bands",
  "Campaigns",
  "Organizations",
  "Windows",
  "Tags",
  "Users",
  "Auth",
  "Infrastructure",
];

export function ChangeFilterBar({
  dateRange,
  onDateRangeChange,
  userId,
  onUserIdChange,
  action,
  onActionChange,
  resource,
  onResourceChange,
  users,
  from,
  to,
}: ChangeFilterBarProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const hasFilters = !!(dateRange || userId || action || resource);

  function handleClearFilters() {
    onDateRangeChange(undefined);
    onUserIdChange(undefined);
    onActionChange(undefined);
    onResourceChange(undefined);
  }

  const dateRangeLabel =
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d")}`
      : dateRange?.from
        ? format(dateRange.from, "MMM d")
        : "Pick dates";

  // Quick preset helpers
  function setLast24h() {
    onDateRangeChange({ from: subHours(new Date(), 24), to: new Date() });
  }

  function setLast7Days() {
    onDateRangeChange({ from: subDays(new Date(), 7), to: new Date() });
  }

  function setAuthEvents() {
    onActionChange("auth");
  }

  function setDeletions() {
    onActionChange("delete");
  }

  const isLast24hActive =
    dateRange?.from &&
    dateRange.from.getTime() >= subHours(new Date(), 25).getTime() &&
    dateRange.from.getTime() <= subHours(new Date(), 23).getTime();

  const isLast7DaysActive =
    dateRange?.from &&
    dateRange.from.getTime() >= subDays(new Date(), 8).getTime() &&
    dateRange.from.getTime() <= subDays(new Date(), 6).getTime();

  const isAuthEventsActive = action === "auth";
  const isDeletionsActive = action === "delete";

  return (
    <div className="space-y-3">
      {/* Main filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range picker */}
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {dateRangeLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={(range) => {
                onDateRangeChange(range);
                if (range?.from && range?.to) {
                  setCalendarOpen(false);
                }
              }}
              numberOfMonths={2}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* User dropdown */}
        <Select
          value={userId ?? "all"}
          onValueChange={(v) => onUserIdChange(v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name ? `${u.name} (${u.email})` : u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Action type dropdown */}
        <Select
          value={action ?? "all"}
          onValueChange={(v) => onActionChange(v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {ACTION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Resource dropdown */}
        <Select
          value={resource ?? "all"}
          onValueChange={(v) => onResourceChange(v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            {RESOURCE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters} className="gap-1">
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}

        {/* Export button — pushed to right */}
        <div className="ml-auto">
          <ChangeExportButton from={from} to={to} userId={userId} action={action} resource={resource} />
        </div>
      </div>

      {/* Quick preset row */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={isLast24hActive ? "default" : "outline"}
          size="sm"
          onClick={setLast24h}
        >
          Last 24h
        </Button>
        <Button
          variant={isLast7DaysActive ? "default" : "outline"}
          size="sm"
          onClick={setLast7Days}
        >
          Last 7 days
        </Button>
        <Button
          variant={isAuthEventsActive ? "default" : "outline"}
          size="sm"
          onClick={setAuthEvents}
        >
          Auth events
        </Button>
        <Button
          variant={isDeletionsActive ? "default" : "outline"}
          size="sm"
          onClick={setDeletions}
        >
          Deletions
        </Button>
      </div>
    </div>
  );
}
