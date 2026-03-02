"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sparkmotion/ui/select";

interface CampaignFilterProps {
  campaigns: Array<{ id: string; name: string }>;
  selected?: string;
}

export function CampaignFilter({ campaigns, selected }: CampaignFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("campaignId");
    } else {
      params.set("campaignId", value);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "/events");
  };

  return (
    <Select value={selected || "all"} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px]">
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
  );
}
