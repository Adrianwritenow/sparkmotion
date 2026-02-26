"use client";

import { useState } from "react";
import { MoreHorizontal, Mail, MailPlus, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DeleteUserDialog } from "./delete-user-dialog";
import type { UserRow } from "@/app/(dashboard)/users/page";

interface UserActionsProps {
  user: UserRow;
}

export function UserActions({ user }: UserActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const sendInvite = trpc.users.sendInvite.useMutation({
    onSuccess: () => {
      toast.success(`Invite sent to ${user.name || user.email}`);
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetPassword = trpc.users.adminResetUserPassword.useMutation({
    onSuccess: () => {
      toast.success(`Password reset email sent to ${user.name || user.email}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const isNotInvited = user.status === "not_invited";
  const isPending = user.status === "pending";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isNotInvited && (
            <DropdownMenuItem
              onClick={() => sendInvite.mutate({ userId: user.id })}
              disabled={sendInvite.isLoading}
            >
              <Mail className="mr-2 h-4 w-4" />
              Send Invite
            </DropdownMenuItem>
          )}
          {isPending && (
            <DropdownMenuItem
              onClick={() => sendInvite.mutate({ userId: user.id })}
              disabled={sendInvite.isLoading}
            >
              <MailPlus className="mr-2 h-4 w-4" />
              Resend Invite
            </DropdownMenuItem>
          )}
          {user.status === "active" && (
            <DropdownMenuItem
              onClick={() => resetPassword.mutate({ userId: user.id })}
              disabled={resetPassword.isLoading}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Reset Password
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteUserDialog
        user={user}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
