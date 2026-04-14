export const KEYS = {
  band: (orgSlug: string, bandId: string) => `band:${orgSlug}:${bandId}` as const,
  bandByEvent: (eventId: string, bandId: string) => `band:evt:${eventId}:${bandId}` as const,
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
  tapsReceived: () => "monitoring:taps:received" as const,
  tapsFlushed: () => "monitoring:taps:flushed" as const,
  tapsDropped: () => "monitoring:taps:dropped" as const,
  errorCounter: (type: string) => `monitoring:errors:${type}` as const,
  errorEventHash: (eventId: string) => `monitoring:errors:event:${eventId}` as const,
  errorLog: () => "monitoring:errors:log" as const,
} as const;
