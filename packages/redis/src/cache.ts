import { redis } from "./client";
import { KEYS } from "./keys";

export interface CachedBand {
  bandId: string;
  eventId: string;
  status: string;
  currentMode: string;
  redirectUrl: string;
}

export interface CachedEventStatus {
  currentMode: string;
  activeWindowId: string | null;
  redirectUrl: string | null;
}

const BAND_TTL = 300; // 5 minutes
const EVENT_TTL = 60; // 1 minute

export async function getCachedBand(bandId: string): Promise<CachedBand | null> {
  const data = await redis.get(KEYS.band(bandId));
  return data ? JSON.parse(data) : null;
}

export async function setCachedBand(bandId: string, band: CachedBand): Promise<void> {
  await redis.set(KEYS.band(bandId), JSON.stringify(band), "EX", BAND_TTL);
}

export async function getCachedEventStatus(eventId: string): Promise<CachedEventStatus | null> {
  const data = await redis.get(KEYS.eventStatus(eventId));
  return data ? JSON.parse(data) : null;
}

export async function setCachedEventStatus(eventId: string, status: CachedEventStatus): Promise<void> {
  await redis.set(KEYS.eventStatus(eventId), JSON.stringify(status), "EX", EVENT_TTL);
}

export async function invalidateBandCache(bandId: string): Promise<void> {
  await redis.del(KEYS.band(bandId));
}

export async function invalidateEventCache(eventId: string): Promise<void> {
  await redis.del(KEYS.eventStatus(eventId));
}
