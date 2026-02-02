"use client";

import { ColumnDef } from "@tanstack/react-table";
import { User, OrgUser, Organization } from "@sparkmotion/database";

export type UserWithOrgs = Pick<User, "id" | "name" | "email" | "role" | "createdAt" | "updatedAt"> & {
  orgUsers: (OrgUser & { org: Organization })[];
};

export const columns: ColumnDef<UserWithOrgs>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      return <div className="font-medium">{row.getValue("name") || "—"}</div>;
    },
  },
  {
    id: "organization",
    accessorFn: (row) => row.orgUsers[0]?.org.name ?? "",
    header: "Organization",
    cell: ({ row }) => {
      const orgName = row.original.orgUsers[0]?.org.name;
      return <div className="text-muted-foreground">{orgName || "—"}</div>;
    },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return row.original.orgUsers[0]?.org.name === filterValue;
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => {
      return <div className="text-muted-foreground">{row.getValue("email")}</div>;
    },
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => {
      return <div>{row.getValue("role")}</div>;
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
