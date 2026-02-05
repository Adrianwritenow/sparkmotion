import { redis } from "./client";
import { KEYS } from "./keys";

export async function recordTap(eventId: string, bandId: string, mode: string): Promise<void> {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const bucket = Math.floor(Date.now() / 10000); // 10-second buckets
  const pipeline = redis.pipeline();
  pipeline.incr(KEYS.tapsTotal(eventId));
  pipeline.pfadd(KEYS.tapsUnique(eventId), bandId);
  pipeline.incr(KEYS.tapsHourly(eventId, hour));
  pipeline.incr(KEYS.tapsMode(eventId, mode));

  // Track velocity in 10-second buckets for sparkline
  pipeline.incr(KEYS.velocityBucket(eventId, bucket));
  pipeline.expire(KEYS.velocityBucket(eventId, bucket), 1800); // 30 min TTL

  await pipeline.exec();
}

export async function getAnalytics(eventId: string) {
  const [total, unique, pre, live, post] = await Promise.all([
    redis.get(KEYS.tapsTotal(eventId)),
    redis.pfcount(KEYS.tapsUnique(eventId)),
    redis.get(KEYS.tapsMode(eventId, "pre")),
    redis.get(KEYS.tapsMode(eventId, "live")),
    redis.get(KEYS.tapsMode(eventId, "post")),
  ]);
  return {
    totalTaps: parseInt(total ?? "0", 10),
    uniqueTaps: unique,
    byMode: {
      pre: parseInt(pre ?? "0", 10),
      live: parseInt(live ?? "0", 10),
      post: parseInt(post ?? "0", 10),
    },
  };
}

/**
 * Get hourly tap counts from Redis for the last N hours.
 * Uses the same hourly keys the Worker writes to.
 */
export async function getHourlyAnalytics(
  eventId: string,
  hours: number = 24
): Promise<Array<{ hour: string; count: number }>> {
  const now = new Date();
  const pipeline = redis.pipeline();
  const hourKeys: string[] = [];

  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const hour = d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    hourKeys.push(hour);
    pipeline.get(KEYS.tapsHourly(eventId, hour));
  }

  const results = await pipeline.exec();
  if (!results) return [];

  return results.map((result, index) => {
    const [err, value] = result;
    return {
      hour: hourKeys[index]!,
      count: err ? 0 : parseInt((value as string) ?? "0", 10),
    };
  });
}

/**
 * Get velocity history for sparkline rendering.
 * Returns last N buckets (default 180 = 30 min of 10s buckets).
 * Missing buckets return count: 0.
 */
export async function getVelocityHistory(
  eventId: string,
  buckets: number = 180
): Promise<Array<{ bucket: number; count: number }>> {
  const currentBucket = Math.floor(Date.now() / 10000);
  const startBucket = currentBucket - buckets + 1;

  const pipeline = redis.pipeline();
  for (let i = startBucket; i <= currentBucket; i++) {
    pipeline.get(KEYS.velocityBucket(eventId, i));
  }

  const results = await pipeline.exec();
  if (!results) return [];

  return results.map((result, index) => {
    const [err, value] = result;
    const bucket = startBucket + index;
    const count = err ? 0 : parseInt((value as string) ?? "0", 10);
    return { bucket, count };
  });
}
