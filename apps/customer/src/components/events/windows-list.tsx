"use client";

import { trpc } from "@/lib/trpc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WindowType } from "@sparkmotion/database";

interface WindowsListProps {
  eventId: string;
}

const modeVariants: Record<WindowType, "default" | "secondary" | "destructive"> = {
  PRE: "secondary",
  LIVE: "default",
  POST: "outline" as any,
};

export function WindowsList({ eventId }: WindowsListProps) {
  const utils = trpc.useUtils();
  const { data: windows, isLoading } = trpc.windows.list.useQuery({ eventId });

  const deleteWindow = trpc.windows.delete.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
    },
  });

  const handleDelete = async (windowId: string) => {
    if (confirm("Are you sure you want to delete this window?")) {
      await deleteWindow.mutateAsync({ id: windowId });
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading windows...</div>;
  }

  if (!windows || windows.length === 0) {
    return (
      <div className="text-center py-8 border rounded-lg bg-muted/50">
        <p className="text-muted-foreground">No windows scheduled</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mode</TableHead>
            <TableHead>Start Time</TableHead>
            <TableHead>End Time</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {windows.map((window) => (
            <TableRow key={window.id}>
              <TableCell>
                <Badge variant={modeVariants[window.windowType]}>
                  {window.windowType}
                </Badge>
              </TableCell>
              <TableCell>
                {window.startTime
                  ? new Date(window.startTime).toLocaleString()
                  : "—"}
              </TableCell>
              <TableCell>
                {window.endTime
                  ? new Date(window.endTime).toLocaleString()
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={window.isActive ? "default" : "secondary"}>
                  {window.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(window.id)}
                  disabled={deleteWindow.isPending}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
