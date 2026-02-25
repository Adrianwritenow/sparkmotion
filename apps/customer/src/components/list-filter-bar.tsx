"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";

interface ListFilterBarProps {
  statusOptions?: { value: string; label: string }[];
  totalItems: number;
  pageSize: number;
  currentPage: number;
  searchPlaceholder?: string;
}

export function ListFilterBar({
  statusOptions,
  totalItems,
  pageSize,
  currentPage,
  searchPlaceholder = "Search...",
}: ListFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("search") ?? "");
  const debouncedSearch = useDebounce(searchValue, 300);

  const buildUrl = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(overrides)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      return `?${params.toString()}`;
    },
    [searchParams],
  );

  // Push debounced search to URL
  useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (debouncedSearch === current) return;
    router.push(buildUrl({ search: debouncedSearch || undefined, page: undefined }));
  }, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = (value: string) => {
    router.push(buildUrl({ status: value === "all" ? undefined : value, page: undefined }));
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="space-y-4">
      {/* Search + Status Filter Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9"
          />
        </div>
        {statusOptions && (
          <Select
            value={searchParams.get("status") ?? "all"}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Pagination Row */}
      {totalItems > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {start}-{end} of {totalItems}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => router.push(buildUrl({ page: String(currentPage - 1) }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => router.push(buildUrl({ page: String(currentPage + 1) }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
