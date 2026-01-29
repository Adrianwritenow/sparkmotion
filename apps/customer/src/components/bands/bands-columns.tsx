"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Band } from "@sparkmotion/database";
import { Badge } from "@/components/ui/badge";

const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  ACTIVE: "default",
  DISABLED: "secondary",
  LOST: "destructive",
};

export const columns: ColumnDef<Band>[] = [
  {
    accessorKey: "bandId",
    header: "Band ID",
    cell: ({ row }) => <span className="font-mono text-sm">{row.original.bandId}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status] ?? "secondary"}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "tapCount",
    header: "Tap Count",
  },
  {
    accessorKey: "lastTapAt",
    header: "Last Tap",
    cell: ({ row }) =>
      row.original.lastTapAt
        ? new Date(row.original.lastTapAt).toLocaleString()
        : "—",
  },
];
