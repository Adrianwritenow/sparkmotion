export const KEYS = {
  band: (bandId: string) => `band:${bandId}` as const,
  eventStatus: (eventId: string) => `event:${eventId}:status` as const,
  tapsTotal: (eventId: string) => `analytics:${eventId}:taps:total` as const,
  tapsUnique: (eventId: string) => `analytics:${eventId}:taps:unique` as const,
  tapsHourly: (eventId: string, hour: string) =>
    `analytics:${eventId}:taps:hourly:${hour}` as const,
  tapsMode: (eventId: string, mode: string) =>
    `analytics:${eventId}:mode:${mode}` as const,
  velocityBucket: (eventId: string, bucket: number) =>
    `analytics:${eventId}:velocity:${bucket}` as const,
  tapLogPending: () => "tap-log:pending" as const,
  resetRateLimit: (email: string) => `rate:reset:${email}` as const,
  loginLockout: (email: string) => `lockout:${email}` as const,
} as const;
