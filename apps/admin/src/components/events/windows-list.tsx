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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ModeIndicator } from "./mode-indicator";
import { WindowFormDialog } from "./window-form";

interface WindowsListProps {
  eventId: string;
}

export function WindowsList({ eventId }: WindowsListProps) {
  const utils = trpc.useUtils();
  const { data: windows, isLoading } = trpc.windows.list.useQuery({ eventId });

  const toggleWindow = trpc.windows.toggle.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
    },
  });

  const deleteWindow = trpc.windows.delete.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
    },
  });

  const handleDelete = async (windowId: string) => {
    if (confirm("Are you sure you want to delete this window?")) {
      await deleteWindow.mutateAsync({ id: windowId });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scheduled Windows</h2>
        <WindowFormDialog
          eventId={eventId}
          trigger={<Button>Create Window</Button>}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading windows...</div>
      ) : !windows || windows.length === 0 ? (
        <div className="text-center py-8 border rounded-lg bg-muted/50">
          <p className="text-muted-foreground">No windows scheduled</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mode</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>End Time</TableHead>
                <TableHead>Toggle</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {windows.map((window) => (
                <TableRow key={window.id}>
                  <TableCell>
                    <ModeIndicator
                      mode={window.windowType.toLowerCase() as "pre" | "live" | "post"}
                    />
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {window.url}
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
                    <Switch
                      checked={window.isActive}
                      onCheckedChange={(checked) =>
                        toggleWindow.mutate({ id: window.id, isActive: checked })
                      }
                      disabled={toggleWindow.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <WindowFormDialog
                      eventId={eventId}
                      window={window}
                      trigger={<Button variant="outline" size="sm">Edit</Button>}
                    />
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
      )}
    </div>
  );
}
