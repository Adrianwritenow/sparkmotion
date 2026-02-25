"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { tz, TZDate } from "@date-fns/tz";
import { Calendar as CalendarIcon } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

function getShortTzName(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

const windowFormSchema = z
  .object({
    windowType: z.enum(["PRE", "LIVE", "POST"]),
    title: z.string().optional(),
    url: z.string().url("Must be a valid URL"),
  });

type WindowFormValues = z.infer<typeof windowFormSchema>;

function combineDateAndTime(date: Date, timeStr: string, timezone?: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (timezone) {
    return new TZDate(date.getFullYear(), date.getMonth(), date.getDate(), hours ?? 0, minutes ?? 0, 0, timezone);
  }
  const combined = new Date(date);
  combined.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return combined;
}

interface WindowData {
  id: string;
  windowType: "PRE" | "LIVE" | "POST";
  title?: string | null;
  url: string;
  startTime: Date | string | null;
  endTime: Date | string | null;
}

interface WindowFormDialogProps {
  eventId: string;
  window?: WindowData;
  trigger: React.ReactNode;
  eventTimezone?: string;
  existingWindows: Array<{
    id: string;
    startTime: Date | string | null;
    endTime: Date | string | null;
    windowType: string;
  }>;
}

export function WindowFormDialog({
  eventId,
  window: editWindow,
  trigger,
  eventTimezone,
  existingWindows
}: WindowFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [endTimeError, setEndTimeError] = useState<string>("");

  const utils = trpc.useUtils();
  const isEdit = !!editWindow;

  const form = useForm<WindowFormValues>({
    resolver: zodResolver(windowFormSchema),
    defaultValues: {
      windowType: editWindow?.windowType ?? "LIVE",
      title: editWindow?.title ?? "",
      url: editWindow?.url ?? "",
    },
  });

  // Load existing window data when editing (interpret in event timezone)
  useEffect(() => {
    if (editWindow?.startTime && editWindow?.endTime) {
      const start = new Date(editWindow.startTime);
      const end = new Date(editWindow.endTime);
      const tzOpts = eventTimezone ? { in: tz(eventTimezone) } : undefined;
      const startDateInTz = eventTimezone ? new TZDate(start, eventTimezone) : start;
      const endDateInTz = eventTimezone ? new TZDate(end, eventTimezone) : end;
      setStartDate(new Date(startDateInTz.getFullYear(), startDateInTz.getMonth(), startDateInTz.getDate()));
      setEndDate(new Date(endDateInTz.getFullYear(), endDateInTz.getMonth(), endDateInTz.getDate()));
      setStartTime(format(start, 'HH:mm', tzOpts));
      setEndTime(format(end, 'HH:mm', tzOpts));
      form.reset({
        windowType: editWindow.windowType,
        title: editWindow.title ?? "",
        url: editWindow.url,
      });
    } else if (!editWindow) {
      // Clear on create
      setStartDate(undefined);
      setEndDate(undefined);
      setStartTime("");
      setEndTime("");
      form.reset({ windowType: "LIVE", title: "", url: "" });
    }
  }, [editWindow, form, open]);

  const createWindow = trpc.windows.create.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
      form.reset();
      setStartDate(undefined);
      setEndDate(undefined);
      setStartTime("");
      setEndTime("");
      setFormError("");
      setOpen(false);
    },
    onError: (error) => {
      setFormError(error.message);
    },
  });

  const updateWindow = trpc.windows.update.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      utils.events.byId.invalidate({ id: eventId });
      setFormError("");
      setOpen(false);
    },
    onError: (error) => {
      setFormError(error.message);
    },
  });

  const isPending = createWindow.isPending || updateWindow.isPending;

  // Check if start and end are on the same calendar day
  const isSameDay =
    startDate && endDate &&
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate();

  // Other windows for booked date indicators (NOT disabled — just visual)
  const otherWindows = existingWindows.filter(
    w => w.id !== editWindow?.id && w.startTime && w.endTime
  );

  const isBookedDate = (date: Date) => {
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return otherWindows.some(w => {
      const start = new Date(w.startTime!);
      const end = new Date(w.endTime!);
      const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      return dateOnly >= startOnly && dateOnly <= endOnly;
    });
  };

  const handleSubmit = async (values: WindowFormValues) => {
    if (!startDate) {
      setFormError("Please select a start date");
      return;
    }
    if (!endDate) {
      setFormError("Please select an end date");
      return;
    }
    if (!startTime) {
      setFormError("Please enter a start time");
      return;
    }
    if (!endTime) {
      setFormError("Please enter an end time");
      return;
    }

    const startDateTime = combineDateAndTime(startDate, startTime, eventTimezone);
    const endDateTime = combineDateAndTime(endDate, endTime, eventTimezone);

    if (endDateTime <= startDateTime) {
      setFormError("End date/time must be after start date/time");
      return;
    }

    setFormError("");

    const title = values.title?.trim() || undefined;

    if (isEdit) {
      await updateWindow.mutateAsync({
        id: editWindow.id,
        windowType: values.windowType,
        title,
        url: values.url,
        startTime: startDateTime,
        endTime: endDateTime,
      });
    } else {
      await createWindow.mutateAsync({
        eventId,
        windowType: values.windowType,
        title,
        url: values.url,
        startTime: startDateTime,
        endTime: endDateTime,
        isManual: false,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (!v) {
        setFormError("");
      }
    }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Window" : "Create Window"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Nashville Pre-Show" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            {eventTimezone && (
              <p className="text-xs text-muted-foreground">
                Times are in {eventTimezone.replace(/_/g, ' ')} ({getShortTzName(new Date(), eventTimezone)})
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              {/* Start Date & Time */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      modifiers={{ booked: isBookedDate }}
                      modifiersClassNames={{ booked: "bg-orange-100 dark:bg-orange-900/30" }}
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    const newStart = e.target.value;
                    setStartTime(newStart);
                    // Clear end time if same day and end is now before start
                    if (isSameDay && endTime && newStart && endTime <= newStart) {
                      setEndTime("");
                    }
                  }}
                  placeholder="--:--"
                />
              </div>

              {/* End Date & Time */}
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "MMM d, yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={startDate ? { before: startDate } : undefined}
                      modifiers={{ booked: isBookedDate }}
                      modifiersClassNames={{ booked: "bg-orange-100 dark:bg-orange-900/30" }}
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    const newEnd = e.target.value;
                    if (isSameDay && startTime && newEnd && newEnd <= startTime) {
                      setEndTimeError("End time must be after start time");
                      return;
                    }
                    setEndTimeError("");
                    setEndTime(newEnd);
                  }}
                  min={isSameDay && startTime ? startTime : undefined}
                  placeholder="--:--"
                />
                {endTimeError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{endTimeError}</p>
                )}
              </div>
            </div>

            {/* Existing windows reference */}
            {otherWindows.length > 0 && (
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">Existing Windows:</p>
                {otherWindows.map((w) => {
                  const start = new Date(w.startTime!);
                  const end = new Date(w.endTime!);
                  const fmtOpts = eventTimezone ? { in: tz(eventTimezone) } : undefined;
                  const tzAbbr = eventTimezone ? ` ${getShortTzName(end, eventTimezone)}` : '';
                  return (
                    <div key={w.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-3 h-3 rounded bg-orange-200 dark:bg-orange-800" />
                      <span>
                        {w.windowType}: {format(start, 'MMM d, h:mm a', fmtOpts)} – {format(end, 'MMM d, h:mm a', fmtOpts)}{tzAbbr}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {formError && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                {formError}
              </div>
            )}

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
