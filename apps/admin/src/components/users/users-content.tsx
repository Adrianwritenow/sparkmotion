"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UsersTable } from "./users-table";
import { type UserWithOrg } from "./columns";

interface UsersContentProps {
  data: UserWithOrg[];
}

export function UsersContent({ data }: UsersContentProps) {
  const [orgFilter, setOrgFilter] = useState("");

  const orgNames = useMemo(() => {
    const names = new Set<string>();
    data.forEach((user) => {
      const name = user.org?.name;
      if (name) names.add(name);
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

      <UsersTable data={data} orgFilter={orgFilter} />
    </>
  );
}
