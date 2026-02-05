"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { Event, EventStatus } from "@sparkmotion/database";

const eventSchema = z.object({
  name: z.string().min(1, "Name is required"),
  tourName: z.string().optional(),
  slug: z.string().min(1, "Slug is required"),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventEditFormProps {
  event: Event;
}

export function EventEditForm({ event }: EventEditFormProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      name: event.name,
      tourName: event.tourName ?? "",
      slug: event.slug,
      status: event.status,
    },
  });

  const currentStatus = watch("status");

  const updateEvent = trpc.events.update.useMutation({
    onSuccess: () => {
      utils.events.list.invalidate();
      utils.events.byId.invalidate({ id: event.id });
      router.refresh();
    },
  });

  const onSubmit = (data: EventFormData) => {
    updateEvent.mutate({
      id: event.id,
      name: data.name,
      tourName: data.tourName || undefined,
      slug: data.slug,
      status: data.status,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Event Name</Label>
          <Input
            id="name"
            {...register("name")}
            placeholder="Nashville Stop"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="tourName">Tour Name</Label>
          <Input
            id="tourName"
            {...register("tourName")}
            placeholder="2026 Spring Tour"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            {...register("slug")}
            placeholder="nashville-2026"
          />
          {errors.slug && (
            <p className="text-sm text-destructive">{errors.slug.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={currentStatus}
            onValueChange={(value) => setValue("status", value as EventStatus, { shouldDirty: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active (Published)</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!isDirty || updateEvent.isPending}>
          {updateEvent.isPending ? "Saving..." : "Save Changes"}
        </Button>
        {updateEvent.isSuccess && (
          <span className="text-sm text-green-600 self-center">Saved!</span>
        )}
        {updateEvent.isError && (
          <span className="text-sm text-destructive self-center">
            Error: {updateEvent.error.message}
          </span>
        )}
      </div>
    </form>
  );
}
