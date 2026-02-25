"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Users, Plus } from "lucide-react";
import { AddMemberDialog } from "./add-member-dialog";

interface MembersTableProps {
  orgId: string;
}

export function MembersTable({ orgId }: MembersTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: members, isLoading } =
    trpc.organizations.listMembers.useQuery({ orgId });

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-6 py-4 flex items-center gap-4">
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            {members?.length ?? 0}{" "}
            {members?.length === 1 ? "member" : "members"}
          </h3>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Member
          </button>
        </div>

        {members && members.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((member) => (
                  <tr
                    key={member.id}
                    className="bg-card hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-foreground">
                      {member.name || "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {member.email}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {member.orgRole}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <h3 className="text-lg font-medium text-foreground">
              No Members Yet
            </h3>
            <p>Add members to this organization to get started.</p>
          </div>
        )}
      </div>

      <AddMemberDialog
        orgId={orgId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
