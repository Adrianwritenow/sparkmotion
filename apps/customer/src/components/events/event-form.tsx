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

const eventFormSchema = z.object({
  name: z.string().min(1, "Event name is required"),
  tourName: z.string().optional(),
  slug: z.string().min(1, "Slug is required"),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  onSubmit: (values: EventFormValues) => Promise<void>;
  isPending: boolean;
}

export function EventForm({ onSubmit, isPending }: EventFormProps) {
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      name: "",
      tourName: "",
      slug: "",
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

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Creating..." : "Create Event"}
        </Button>
      </form>
    </Form>
  );
}
