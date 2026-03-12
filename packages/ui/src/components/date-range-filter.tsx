"use client";

import { Button } from "./ui/button";
import { startOfDay, subDays, subHours, endOfDay, formatISO } from "date-fns";
import { TZDate } from "@date-fns/tz";

interface DateRangeFilterProps {
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  timezone?: string;
}

const ALL_TIME_FROM = "2020-01-01T00:00:00.000Z";

const presets = [
  { label: "All time", days: -1 },
  { label: "1h", days: -2 },
  { label: "Today", days: 0 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

export function DateRangeFilter({ from, to, onRangeChange, timezone }: DateRangeFilterProps) {
  const handlePresetClick = (days: number) => {
    const now = timezone ? new TZDate(new Date(), timezone) : new Date();
    if (days === -1) {
      onRangeChange(ALL_TIME_FROM, formatISO(endOfDay(now)));
      return;
    }
    if (days === -2) {
      onRangeChange(formatISO(subHours(now, 1)), formatISO(now));
      return;
    }
    const fromDate = days === 0 ? startOfDay(now) : subDays(startOfDay(now), days);
    onRangeChange(formatISO(fromDate), formatISO(endOfDay(now)));
  };

  const isActivePreset = (days: number) => {
    if (days === -1) {
      return from === ALL_TIME_FROM;
    }
    if (days === -2) {
      // 1h preset: check if range is roughly 1 hour
      const diffMs = new Date(to).getTime() - new Date(from).getTime();
      return diffMs > 50 * 60 * 1000 && diffMs <= 60 * 60 * 1000;
    }
    const now = new Date();
    const presetFrom = days === 0 ? startOfDay(now) : subDays(startOfDay(now), days);
    const presetTo = endOfDay(now);

    // Compare ISO strings (rough match by date)
    const presetFromStr = formatISO(presetFrom).split('T')[0];
    const presetToStr = formatISO(presetTo).split('T')[0];
    const currentFromStr = from.split('T')[0];
    const currentToStr = to.split('T')[0];

    return presetFromStr === currentFromStr && presetToStr === currentToStr;
  };

  return (
    <div className="flex gap-2">
      {presets.map((preset) => (
        <Button
          key={preset.label}
          variant={isActivePreset(preset.days) ? "default" : "outline"}
          onClick={() => handlePresetClick(preset.days)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
