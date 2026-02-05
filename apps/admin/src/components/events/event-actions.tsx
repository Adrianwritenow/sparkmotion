"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { EventStatus } from "@sparkmotion/database";

interface EventActionsProps {
  eventId: string;
  currentStatus: EventStatus;
}

const statusOptions: { value: EventStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active (Publish)" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export function EventActions({ eventId, currentStatus }: EventActionsProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const updateEvent = trpc.events.update.useMutation({
    onSuccess: () => {
      utils.events.list.invalidate();
      router.refresh();
    },
  });

  const handleStatusChange = (status: EventStatus) => {
    if (status === currentStatus) return;
    updateEvent.mutate({ id: eventId, status });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Change Status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {statusOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleStatusChange(option.value)}
            disabled={option.value === currentStatus || updateEvent.isPending}
            className={option.value === currentStatus ? "font-semibold" : ""}
          >
            {option.label}
            {option.value === currentStatus && " (current)"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
