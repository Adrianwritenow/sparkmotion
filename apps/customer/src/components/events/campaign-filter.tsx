"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface CampaignFilterProps {
  campaigns: Array<{ id: string; name: string }>;
  selected?: string;
}

export function CampaignFilter({ campaigns, selected }: CampaignFilterProps) {
  const router = useRouter();

  const handleChange = (value: string) => {
    if (value === "all") {
      router.push("/events");
    } else {
      router.push(`/events?campaignId=${value}`);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="campaign-filter" className="text-sm font-medium">
        Filter by Campaign:
      </Label>
      <Select value={selected || "all"} onValueChange={handleChange}>
        <SelectTrigger id="campaign-filter" className="w-[250px]">
          <SelectValue placeholder="All campaigns" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All campaigns</SelectItem>
          {campaigns.map((campaign) => (
            <SelectItem key={campaign.id} value={campaign.id}>
              {campaign.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
