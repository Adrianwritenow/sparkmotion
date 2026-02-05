"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Event, Organization, EventStatus } from "@sparkmotion/database";
import { EventActions } from "./event-actions";

// Type for event with org and band count
type EventWithDetails = Event & {
  org: Organization;
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
    id: "organization",
    accessorFn: (row) => row.org.name,
    header: "Organization",
    cell: ({ row }) => {
      return <div>{row.original.org.name}</div>;
    },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return row.original.org.name === filterValue;
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
    accessorKey: "tourName",
    header: "Tour",
    cell: ({ row }) => {
      const tourName = row.getValue("tourName") as string | null;
      return <div className="text-muted-foreground">{tourName || "—"}</div>;
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
  {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      return (
        <EventActions
          eventId={row.original.id}
          currentStatus={row.original.status}
        />
      );
    },
  },
];
