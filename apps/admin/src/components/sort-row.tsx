"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@sparkmotion/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sparkmotion/ui/select";

interface SortRowProps {
  options: { value: string; label: string }[];
}

export function SortRow({ options }: SortRowProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return `?${params.toString()}`;
  };

  const handleSortChange = (value: string) => {
    router.push(buildUrl({ sort: value === "createdAt" ? undefined : value, page: undefined }));
  };

  const handleDirToggle = () => {
    const currentDir = searchParams.get("dir") ?? "desc";
    router.push(buildUrl({ dir: currentDir === "desc" ? "asc" : undefined, page: undefined }));
  };

  return (
    <div className="flex items-center justify-end gap-1 mb-4">
      <Select
        value={searchParams.get("sort") ?? "createdAt"}
        onValueChange={handleSortChange}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handleDirToggle}
        title={searchParams.get("dir") === "asc" ? "Ascending" : "Descending"}
      >
        {searchParams.get("dir") === "asc" ? (
          <ArrowUp className="w-3.5 h-3.5" />
        ) : (
          <ArrowDown className="w-3.5 h-3.5" />
        )}
      </Button>
    </div>
  );
}
