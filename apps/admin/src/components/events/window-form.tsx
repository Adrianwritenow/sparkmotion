"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const windowFormSchema = z
  .object({
    windowType: z.enum(["PRE", "LIVE", "POST"]),
    url: z.string().url("Must be a valid URL"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
  })
  .refine(
    (data) => new Date(data.endTime) > new Date(data.startTime),
    { message: "End time must be after start time", path: ["endTime"] }
  );

type WindowFormValues = z.infer<typeof windowFormSchema>;

function toDatetimeLocal(date: Date | string): string {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

interface WindowData {
  id: string;
  windowType: "PRE" | "LIVE" | "POST";
  url: string;
  startTime: Date | string | null;
  endTime: Date | string | null;
}

interface WindowFormDialogProps {
  eventId: string;
  window?: WindowData;
  trigger: React.ReactNode;
}

export function WindowFormDialog({ eventId, window: editWindow, trigger }: WindowFormDialogProps) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const isEdit = !!editWindow;

  const form = useForm<WindowFormValues>({
    resolver: zodResolver(windowFormSchema),
    defaultValues: {
      windowType: editWindow?.windowType ?? "PRE",
      url: editWindow?.url ?? "",
      startTime: editWindow?.startTime ? toDatetimeLocal(editWindow.startTime) : "",
      endTime: editWindow?.endTime ? toDatetimeLocal(editWindow.endTime) : "",
    },
  });

  const createWindow = trpc.windows.create.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      form.reset();
      setOpen(false);
    },
  });

  const updateWindow = trpc.windows.update.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
      setOpen(false);
    },
  });

  const isPending = createWindow.isPending || updateWindow.isPending;

  const handleSubmit = async (values: WindowFormValues) => {
    if (isEdit) {
      await updateWindow.mutateAsync({
        id: editWindow.id,
        windowType: values.windowType,
        url: values.url,
        startTime: new Date(values.startTime),
        endTime: new Date(values.endTime),
      });
    } else {
      await createWindow.mutateAsync({
        eventId,
        windowType: values.windowType,
        url: values.url,
        startTime: new Date(values.startTime),
        endTime: new Date(values.endTime),
        isManual: false,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v && editWindow) {
        form.reset({
          windowType: editWindow.windowType,
          url: editWindow.url,
          startTime: editWindow.startTime ? toDatetimeLocal(editWindow.startTime) : "",
          endTime: editWindow.endTime ? toDatetimeLocal(editWindow.endTime) : "",
        });
      }
      if (v && !editWindow) {
        form.reset({ windowType: "PRE", url: "", startTime: "", endTime: "" });
      }
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Window" : "Create Window"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="windowType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Window Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select window type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PRE">PRE</SelectItem>
                      <SelectItem value="LIVE">LIVE</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Redirect URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com/page" type="url" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Time</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Time</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending
                ? isEdit ? "Saving..." : "Creating..."
                : isEdit ? "Save Changes" : "Create Window"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
