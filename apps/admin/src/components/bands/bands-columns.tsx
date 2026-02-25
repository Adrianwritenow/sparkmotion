"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Band } from "@sparkmotion/database";
import { Flag, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export type BandWithTag = Band & {
  tag?: { id: string; title: string } | null;
};

export function getColumns(opts: {
  selectedIds: Set<string>;
  allSelected: boolean;
  toggleAll: () => void;
  toggleOne: (id: string) => void;
  onResolve: (id: string) => void;
}): ColumnDef<BandWithTag>[] {
  return [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={opts.allSelected}
          onCheckedChange={opts.toggleAll}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={opts.selectedIds.has(row.original.id)}
          onCheckedChange={() => opts.toggleOne(row.original.id)}
          aria-label={`Select ${row.original.bandId}`}
        />
      ),
      size: 40,
    },
    {
      accessorKey: "bandId",
      header: "Band ID",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{row.original.bandId}</span>
          {row.original.autoAssigned && (
            row.original.flagged ? (
              <Flag className="w-4 h-4 fill-red-500 text-red-500" />
            ) : (
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            )
          )}
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => row.original.name || "—",
    },
    {
      id: "tag",
      header: "Tag",
      cell: ({ row }) =>
        row.original.tag ? (
          <Badge variant="secondary">{row.original.tag.title}</Badge>
        ) : (
          "—"
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
    {
      id: "actions",
      header: "",
      cell: ({ row }) =>
        row.original.flagged ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              opts.onResolve(row.original.id);
            }}
          >
            Resolve
          </Button>
        ) : null,
    },
  ];
}
