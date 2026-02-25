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
import { GooglePlacesAutocomplete } from "./google-places-autocomplete";
import { getTimezoneForLocation } from "@/lib/us-timezones";

const eventFormSchema = z.object({
  name: z.string().min(1, "Event name is required"),
  location: z.string().optional(),
  venueName: z.string().optional(),
  formattedAddress: z.string().min(1, "Location is required"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zipcode: z.string().optional(),
  estimatedAttendees: z.union([z.number().int().positive(), z.nan()]).optional().transform(val =>
    val === undefined || Number.isNaN(val) ? undefined : val
  ),
  campaignId: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  onSubmit: (values: EventFormValues) => Promise<void>;
  isPending: boolean;
  campaigns: Array<{ id: string; name: string }>;
  defaultCampaignId?: string;
}

export function EventForm({ onSubmit, isPending, campaigns, defaultCampaignId }: EventFormProps) {
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      name: "",
      location: "",
      venueName: "",
      formattedAddress: "",
      latitude: undefined,
      longitude: undefined,
      timezone: "",
      city: "",
      state: "",
      country: "",
      zipcode: "",
      estimatedAttendees: undefined,
      campaignId: defaultCampaignId ?? "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Nashville Stop"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!defaultCampaignId && (
          <FormField
            control={form.control}
            name="campaignId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Campaign (Optional)</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                  defaultValue={field.value || "none"}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="No campaign" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No campaign</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="formattedAddress"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <GooglePlacesAutocomplete
                  defaultValue={field.value}
                  onPlaceSelect={(place) => {
                    form.setValue("venueName", place.venueName);
                    form.setValue("formattedAddress", place.formattedAddress);
                    form.setValue("latitude", place.latitude);
                    form.setValue("longitude", place.longitude);
                    form.setValue("city", place.city);
                    form.setValue("state", place.state);
                    form.setValue("country", place.country);
                    form.setValue("zipcode", place.zipcode);
                    const location = [place.city, place.state].filter(Boolean).join(", ");
                    form.setValue("location", location || place.formattedAddress);
                    const detectedTz = getTimezoneForLocation(location);
                    if (detectedTz) {
                      form.setValue("timezone", detectedTz);
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="estimatedAttendees"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estimated Attendees (Optional)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  placeholder="5000"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.valueAsNumber)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Creating..." : "Create Event"}
        </Button>
      </form>
    </Form>
  );
}
