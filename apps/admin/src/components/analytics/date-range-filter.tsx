"use client";

import { Button } from "@/components/ui/button";
import { startOfDay, subDays, endOfDay, formatISO } from "date-fns";

interface DateRangeFilterProps {
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
}

const presets = [
  { label: "Today", days: 0 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

export function DateRangeFilter({ from, to, onRangeChange }: DateRangeFilterProps) {
  const handlePresetClick = (days: number) => {
    const now = new Date();
    const fromDate = days === 0 ? startOfDay(now) : subDays(startOfDay(now), days);
    const toDate = endOfDay(now);

    onRangeChange(formatISO(fromDate), formatISO(toDate));
  };

  const isActivePreset = (days: number) => {
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
