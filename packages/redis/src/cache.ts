import { redis } from "./client";
import { KEYS } from "./keys";

export interface CachedBand {
  id: string;
  bandId: string;
  eventId: string;
  currentMode: string;
  redirectUrl: string;
  windowId: string | null;
}

const BAND_TTL = 60; // 1 minute — tighter consistency when window URLs change

export async function getCachedBand(bandId: string): Promise<CachedBand | null> {
  const data = await redis.get(KEYS.band(bandId));
  return data ? JSON.parse(data) : null;
}

export async function setCachedBand(bandId: string, band: CachedBand): Promise<void> {
  await redis.set(KEYS.band(bandId), JSON.stringify(band), "EX", BAND_TTL);
}

export async function invalidateBandCache(bandId: string): Promise<void> {
  await redis.del(KEYS.band(bandId));
}

export async function invalidateEventAnalytics(eventId: string): Promise<void> {
  const pattern = `analytics:${eventId}:*`;
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}

export async function invalidateEventCache(eventId: string): Promise<void> {
  await redis.del(KEYS.eventStatus(eventId));
  await invalidateEventAnalytics(eventId);
}
