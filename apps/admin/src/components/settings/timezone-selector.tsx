'use client';

import { trpc } from '@/lib/trpc';
import { TimezoneSelector } from '@sparkmotion/ui';

export function TimezoneSelectorConnected() {
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
    <TimezoneSelector
      value={selectedTimezone}
      onValueChange={(tz) => updateTimezone.mutate({ timezone: tz })}
      isSuccess={updateTimezone.isSuccess}
      isError={updateTimezone.isError}
    />
  );
}
