"use client";

import { MoreHorizontal, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface UserActionsProps {
  userId: string;
  userName: string | null;
}

export function UserActions({ userId, userName }: UserActionsProps) {
  const resetPassword = trpc.users.adminResetUserPassword.useMutation({
    onSuccess: () => {
      toast.success(`Password reset email sent to ${userName || "user"}`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => resetPassword.mutate({ userId })}
          disabled={resetPassword.isLoading}
        >
          <KeyRound className="mr-2 h-4 w-4" />
          Send Password Reset
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
