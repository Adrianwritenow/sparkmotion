"use client";

import { ColumnDef } from "@tanstack/react-table";
import { User, Organization } from "@sparkmotion/database";
import { UserActions } from "./user-actions";

export type UserWithOrg = Pick<User, "id" | "name" | "email" | "role" | "createdAt" | "updatedAt"> & {
  org: Organization | null;
};

export const columns: ColumnDef<UserWithOrg>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      return <div className="font-medium">{row.getValue("name") || "\u2014"}</div>;
    },
  },
  {
    id: "organization",
    accessorFn: (row) => row.org?.name ?? "",
    header: "Organization",
    cell: ({ row }) => {
      const orgName = row.original.org?.name;
      return <div className="text-muted-foreground">{orgName || "\u2014"}</div>;
    },
    filterFn: (row, _columnId, filterValue) => {
      if (!filterValue) return true;
      return row.original.org?.name === filterValue;
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
  {
    id: "actions",
    header: "",
    cell: ({ row }) => {
      return (
        <UserActions
          userId={row.original.id}
          userName={row.original.name}
        />
      );
    },
  },
];
