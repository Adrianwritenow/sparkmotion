"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { UserActions } from "./user-actions";
import type { UserRow, UserStatus } from "@/app/(dashboard)/users/page";

const statusConfig: Record<UserStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  },
  not_invited: {
    label: "Not Invited",
    className: "border-border text-muted-foreground",
  },
};

export function getColumns(role: "ADMIN" | "CUSTOMER"): ColumnDef<UserRow>[] {
  const base: ColumnDef<UserRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name") || "\u2014"}</div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <div className="text-muted-foreground">{row.getValue("email")}</div>
      ),
    },
  ];

  if (role === "CUSTOMER") {
    base.push({
      accessorKey: "orgName",
      header: "Organization",
      cell: ({ row }) => (
        <div className="text-muted-foreground">
          {row.original.orgName || "\u2014"}
        </div>
      ),
    });
  }

  base.push(
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        const config = statusConfig[status];
        return (
          <Badge variant="outline" className={config.className}>
            {config.label}
          </Badge>
        );
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
      cell: ({ row }) => <UserActions user={row.original} />,
    }
  );

  return base;
}
