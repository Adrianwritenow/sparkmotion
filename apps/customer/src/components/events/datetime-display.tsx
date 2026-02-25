'use client';
import { format } from 'date-fns';
import { tz } from '@date-fns/tz';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function getShortTzName(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

function formatInTz(date: Date, fmt: string, timezone: string): string {
  const hasTz = fmt.includes('zzz');
  const cleanFmt = hasTz ? fmt.replace(/\s*zzz/, '') : fmt;
  const formatted = format(date, cleanFmt, { in: tz(timezone) });
  return hasTz ? `${formatted} ${getShortTzName(date, timezone)}` : formatted;
}

interface DateTimeDisplayProps {
  date: Date | string;
  eventTimezone: string;
  userTimezone?: string | null;
  format?: string;
}

export function DateTimeDisplay({
  date,
  eventTimezone,
  userTimezone,
  format: fmt = 'MMM d, yyyy h:mm a zzz',
}: DateTimeDisplayProps) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const primaryDisplay = formatInTz(d, fmt, eventTimezone);
  const showSecondary = userTimezone && userTimezone !== eventTimezone;
  const secondaryDisplay = showSecondary ? formatInTz(d, fmt, userTimezone!) : null;

  if (!secondaryDisplay) {
    return <span>{primaryDisplay}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help border-b border-dotted border-muted-foreground/40">
            {primaryDisplay}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{secondaryDisplay} (your time)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
