'use client';

import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { US_TIMEZONES } from '../utils/us-timezones';

interface TimezoneSelectorProps {
  value: string;
  onValueChange: (timezone: string) => void;
  isSuccess?: boolean;
  isError?: boolean;
}

export function TimezoneSelector({ value, onValueChange, isSuccess, isError }: TimezoneSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>Timezone Preference</Label>
      <p className="text-xs text-muted-foreground">
        Times display in the event timezone. Hover to see your preferred timezone.
      </p>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select timezone" />
        </SelectTrigger>
        <SelectContent>
          {US_TIMEZONES.map((tz) => (
            <SelectItem key={tz.value} value={tz.value}>
              {tz.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isSuccess && (
        <p className="text-xs text-green-600">Timezone saved</p>
      )}
      {isError && (
        <p className="text-xs text-destructive">Failed to save timezone</p>
      )}
    </div>
  );
}
