import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    },
    commandTimeout: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

if (process.env.NODE_ENV === "production") {
  const redisUrl = process.env.REDIS_URL ?? "";
  if (redisUrl && !redisUrl.startsWith("rediss://")) {
    console.warn(
      "WARNING: REDIS_URL does not use TLS (rediss://) in production. " +
      "This may expose data in transit. Current protocol: " +
      redisUrl.split("://")[0] + "://"
    );
  }
}
