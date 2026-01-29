"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
  })
  .refine(
    (data) => {
      const start = new Date(data.startTime);
      const end = new Date(data.endTime);
      return end > start;
    },
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  );

type WindowFormValues = z.infer<typeof windowFormSchema>;

interface WindowFormProps {
  eventId: string;
}

export function WindowForm({ eventId }: WindowFormProps) {
  const utils = trpc.useUtils();

  const form = useForm<WindowFormValues>({
    resolver: zodResolver(windowFormSchema),
    defaultValues: {
      windowType: "PRE",
      startTime: "",
      endTime: "",
    },
  });

  const createWindow = trpc.windows.create.useMutation({
    onSuccess: () => {
      utils.windows.list.invalidate({ eventId });
      form.reset();
    },
  });

  const handleSubmit = async (values: WindowFormValues) => {
    await createWindow.mutateAsync({
      eventId,
      windowType: values.windowType,
      startTime: new Date(values.startTime),
      endTime: new Date(values.endTime),
      isManual: false,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="windowType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Window Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
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

        <Button type="submit" disabled={createWindow.isPending} className="w-full">
          {createWindow.isPending ? "Creating..." : "Create Window"}
        </Button>
      </form>
    </Form>
  );
}
