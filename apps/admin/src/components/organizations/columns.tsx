"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Organization } from "@sparkmotion/database";

type OrgWithCounts = Organization & {
  _count: {
    events: number;
  };
};

export const columns: ColumnDef<OrgWithCounts>[] = [
  {
    accessorKey: "name",
    header: "Organization",
    cell: ({ row }) => {
      return <div className="font-medium">{row.getValue("name")}</div>;
    },
  },
  {
    accessorKey: "slug",
    header: "Slug",
    cell: ({ row }) => {
      return <div className="text-muted-foreground">{row.getValue("slug")}</div>;
    },
  },
  {
    accessorKey: "_count.events",
    header: "Events",
    cell: ({ row }) => {
      return <div className="text-center">{row.original._count.events}</div>;
    },
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as Date;
      return (
        <div className="text-muted-foreground">
          {new Date(date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      );
    },
  },
];
