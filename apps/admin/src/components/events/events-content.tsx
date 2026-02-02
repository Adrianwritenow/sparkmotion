"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EventsAnalytics } from "./events-analytics";
import { EventsTable } from "./events-table";
import { Event, Organization } from "@sparkmotion/database";

type EventWithDetails = Event & {
  org: Organization;
  _count: {
    bands: number;
  };
};

interface EventsContentProps {
  data: EventWithDetails[];
}

export function EventsContent({ data }: EventsContentProps) {
  const [orgFilter, setOrgFilter] = useState("");

  const orgNames = useMemo(() => {
    const names = new Set<string>();
    data.forEach((event) => {
      if (event.org.name) names.add(event.org.name);
    });
    return Array.from(names).sort();
  }, [data]);

  return (
    <>
      <div className="flex items-center gap-2 mb-6">
        <Select
          value={orgFilter || "all"}
          onValueChange={(value) => setOrgFilter(value === "all" ? "" : value)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Organizations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Organizations</SelectItem>
            {orgNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <EventsAnalytics />

      <div className="mt-6">
        <EventsTable data={data} orgFilter={orgFilter} />
      </div>
    </>
  );
}
