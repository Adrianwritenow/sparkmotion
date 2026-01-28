import { redis } from "./client";
import { KEYS } from "./keys";

export async function recordTap(eventId: string, bandId: string, mode: string): Promise<void> {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const pipeline = redis.pipeline();
  pipeline.incr(KEYS.tapsTotal(eventId));
  pipeline.pfadd(KEYS.tapsUnique(eventId), bandId);
  pipeline.incr(KEYS.tapsHourly(eventId, hour));
  pipeline.incr(KEYS.tapsMode(eventId, mode));
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
