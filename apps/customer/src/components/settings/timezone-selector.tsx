'use client';
import { trpc } from '@/lib/trpc';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { US_TIMEZONES } from '@/lib/us-timezones';

export function TimezoneSelector() {
  const { data: user } = trpc.users.me.useQuery();
  const utils = trpc.useUtils();
  const updateTimezone = trpc.users.updateTimezone.useMutation({
    onSuccess: () => utils.users.me.invalidate(),
  });

  const browserTimezone = typeof window !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'America/Chicago';
  const selectedTimezone = user?.timezone || browserTimezone;

  return (
    <div className="space-y-2">
      <Label>Timezone Preference</Label>
      <p className="text-xs text-muted-foreground">
        Times display in the event timezone. Hover to see your preferred timezone.
      </p>
      <Select
        value={selectedTimezone}
        onValueChange={(value) => updateTimezone.mutate({ timezone: value })}
      >
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
      {updateTimezone.isSuccess && (
        <p className="text-xs text-green-600">Timezone saved</p>
      )}
      {updateTimezone.isError && (
        <p className="text-xs text-destructive">Failed to save timezone</p>
      )}
    </div>
  );
}
