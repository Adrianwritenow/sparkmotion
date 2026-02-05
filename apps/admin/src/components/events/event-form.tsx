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

const eventFormSchema = z.object({
  orgId: z.string().min(1, "Organization is required"),
  name: z.string().min(1, "Event name is required"),
  tourName: z.string().optional(),
  slug: z.string().min(1, "Slug is required"),
  estimatedAttendees: z.union([z.number().int().positive(), z.nan()]).optional().transform(val =>
    val === undefined || Number.isNaN(val) ? undefined : val
  ),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  onSubmit: (values: EventFormValues) => Promise<void>;
  isPending: boolean;
  orgs: Array<{ id: string; name: string }>;
}

export function EventForm({ onSubmit, isPending, orgs }: EventFormProps) {
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      orgId: "",
      name: "",
      tourName: "",
      slug: "",
      estimatedAttendees: undefined,
    },
  });

  // Auto-generate slug from name on blur
  const handleNameBlur = () => {
    const name = form.getValues("name");
    const currentSlug = form.getValues("slug");

    // Only auto-generate if slug is empty
    if (name && !currentSlug) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      form.setValue("slug", slug);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="orgId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {orgs.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

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
                  onBlur={(e) => {
                    field.onBlur();
                    handleNameBlur();
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input placeholder="nashville-stop" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tourName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tour Name (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="Compassion Tour 2026" {...field} />
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
