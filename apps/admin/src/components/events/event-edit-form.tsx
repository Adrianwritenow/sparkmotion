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
import { GooglePlacesAutocomplete } from "./google-places-autocomplete";
import { getTimezoneForLocation } from "@/lib/us-timezones";

const eventSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  venueName: z.string().optional(),
  formattedAddress: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zipcode: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]),
  estimatedAttendees: z.union([z.number().int().positive(), z.nan(), z.null()]).optional().transform(val =>
    val === undefined || val === null || Number.isNaN(val) ? null : val
  ),
  campaignId: z.string().nullable().optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventEditFormProps {
  event: Omit<Event, "latitude" | "longitude"> & {
    latitude: number | null;
    longitude: number | null;
    campaignId?: string | null;
    location?: string | null;
    venueName?: string | null;
    formattedAddress?: string | null;
    timezone?: string;
  };
  campaigns: Array<{ id: string; name: string }>;
}

export function EventEditForm({ event, campaigns }: EventEditFormProps) {
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
      location: event.location ?? "",
      venueName: event.venueName ?? "",
      formattedAddress: event.formattedAddress ?? "",
      latitude: event.latitude ? Number(event.latitude) : undefined,
      longitude: event.longitude ? Number(event.longitude) : undefined,
      city: (event as any).city ?? "",
      state: (event as any).state ?? "",
      country: (event as any).country ?? "",
      zipcode: (event as any).zipcode ?? "",
      timezone: event.timezone || "UTC",
      status: event.status,
      estimatedAttendees: event.estimatedAttendees ?? undefined,
      campaignId: event.campaignId ?? "",
    },
  });

  const currentStatus = watch("status");
  const currentLocation = watch("location");
  const currentFormattedAddress = watch("formattedAddress");
  const currentCampaignId = watch("campaignId");
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
      location: data.location || undefined,
      venueName: data.venueName || undefined,
      formattedAddress: data.formattedAddress || undefined,
      latitude: data.latitude,
      longitude: data.longitude,
      city: data.city || undefined,
      state: data.state || undefined,
      country: data.country || undefined,
      zipcode: data.zipcode || undefined,
      timezone: data.timezone,
      status: data.status,
      estimatedAttendees: data.estimatedAttendees,
      campaignId: data.campaignId,
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
          <Label htmlFor="estimatedAttendees">Estimated Attendees</Label>
          <Input
            id="estimatedAttendees"
            type="number"
            min="0"
            {...register("estimatedAttendees", { valueAsNumber: true })}
            placeholder="5000"
          />
        </div>

        <div className="space-y-2">
          <Label>Location</Label>
          <GooglePlacesAutocomplete
            defaultValue={currentFormattedAddress || currentLocation || ""}
            onPlaceSelect={(place) => {
              setValue("venueName", place.venueName, { shouldDirty: true });
              setValue("formattedAddress", place.formattedAddress, { shouldDirty: true });
              setValue("latitude", place.latitude, { shouldDirty: true });
              setValue("longitude", place.longitude, { shouldDirty: true });
              setValue("city", place.city, { shouldDirty: true });
              setValue("state", place.state, { shouldDirty: true });
              setValue("country", place.country, { shouldDirty: true });
              setValue("zipcode", place.zipcode, { shouldDirty: true });
              const location = [place.city, place.state].filter(Boolean).join(", ");
              setValue("location", location || place.formattedAddress, { shouldDirty: true });
              const detectedTz = getTimezoneForLocation(location);
              if (detectedTz) {
                setValue("timezone", detectedTz, { shouldDirty: true });
              }
            }}
          />
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

        <div className="space-y-2">
          <Label>Campaign</Label>
          <Select
            value={currentCampaignId || "none"}
            onValueChange={(value) => setValue("campaignId", value === "none" ? null : value, { shouldDirty: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="No campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No campaign</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
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
