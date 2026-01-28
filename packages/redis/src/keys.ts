export const KEYS = {
  band: (bandId: string) => `band:${bandId}` as const,
  eventStatus: (eventId: string) => `event:${eventId}:status` as const,
  tapsTotal: (eventId: string) => `analytics:${eventId}:taps:total` as const,
  tapsUnique: (eventId: string) => `analytics:${eventId}:taps:unique` as const,
  tapsHourly: (eventId: string, hour: string) =>
    `analytics:${eventId}:taps:hourly:${hour}` as const,
  tapsMode: (eventId: string, mode: string) =>
    `analytics:${eventId}:mode:${mode}` as const,
} as const;
