import Redis, { RedisOptions } from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function buildRedisOptions(): RedisOptions {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";

  // Parse URL ourselves to avoid Node DEP0170 warning with rediss:// protocol
  const parsed = new URL(url.replace(/^rediss:/, "https:").replace(/^redis:/, "http:"));
  const useTls = url.startsWith("rediss://");

  if (process.env.NODE_ENV === "production" && !useTls) {
    console.warn(
      "WARNING: REDIS_URL does not use TLS (rediss://) in production."
    );
  }

  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    username: parsed.username || undefined,
    password: decodeURIComponent(parsed.password) || undefined,
    tls: useTls ? {} : undefined,
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy(times) {
      return Math.min(times * 200, 3000);
    },
    commandTimeout: 5000,
  };
}

export const redis =
  globalForRedis.redis ?? new Redis(buildRedisOptions());

// Prevent unhandled rejection crashes from Redis connection errors
redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
