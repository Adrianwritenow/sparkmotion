"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
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
import { cn } from "@/lib/utils";
import type { Campaign } from "@sparkmotion/database";

const campaignEditSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

type CampaignEditValues = z.infer<typeof campaignEditSchema>;

interface CampaignEditFormProps {
  campaign: Campaign;
}

export function CampaignEditForm({ campaign }: CampaignEditFormProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const updateCampaign = trpc.campaigns.update.useMutation({
    onSuccess: () => {
      utils.campaigns.byId.invalidate({ id: campaign.id });
      utils.campaigns.list.invalidate();
      router.refresh();
    },
  });

  const form = useForm<CampaignEditValues>({
    resolver: zodResolver(campaignEditSchema),
    defaultValues: {
      name: campaign.name,
      status: campaign.status as "DRAFT" | "ACTIVE" | "COMPLETED",
      startDate: campaign.startDate
        ? new Date(campaign.startDate)
        : undefined,
      endDate: campaign.endDate
        ? new Date(campaign.endDate)
        : undefined,
    },
  });

  const handleSubmit = async (values: CampaignEditValues) => {
    await updateCampaign.mutateAsync({
      id: campaign.id,
      name: values.name,
      status: values.status,
      startDate: values.startDate ?? null,
      endDate: values.endDate ?? null,
    });
  };

  const startDate = form.watch("startDate");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Campaign Name</FormLabel>
              <FormControl>
                <Input placeholder="Summer Tour 2026" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, "MMM d, yyyy") : "Pick a date"}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        // Clear end date if it's now before the new start date
                        const currentEnd = form.getValues("endDate");
                        if (date && currentEnd && currentEnd < date) {
                          form.setValue("endDate", undefined);
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, "MMM d, yyyy") : "Pick a date"}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={startDate ? { before: startDate } : undefined}
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          disabled={updateCampaign.isPending}
          className="w-full"
        >
          {updateCampaign.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </Form>
  );
}
