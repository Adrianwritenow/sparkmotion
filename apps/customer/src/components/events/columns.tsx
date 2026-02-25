"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Event, EventStatus } from "@sparkmotion/database";

// Type for event with band count (no org needed - all events belong to same org)
type EventWithDetails = Event & {
  _count: {
    bands: number;
  };
};

// Status variant mapping
const statusVariants: Record<EventStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  DRAFT: "secondary",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

export const columns: ColumnDef<EventWithDetails>[] = [
  {
    accessorKey: "name",
    header: "Event Name",
    cell: ({ row }) => {
      return <div className="font-medium">{row.getValue("name")}</div>;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as EventStatus;
      return (
        <Badge variant={statusVariants[status]}>
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "_count.bands",
    header: "Bands",
    cell: ({ row }) => {
      return <div className="text-center">{row.original._count.bands}</div>;
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
