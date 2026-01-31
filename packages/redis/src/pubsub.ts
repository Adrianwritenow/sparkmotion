import Redis from "ioredis";
import { KEYS } from "./keys";

/**
 * Create a NEW Redis client for subscriber mode.
 * Subscribers cannot execute regular commands, so we need a separate client.
 */
export function createSubscriberClient(): Redis {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
  });
}

/**
 * Publish tap update to Redis pub/sub channel.
 * Fire-and-forget — caller should NOT await, wrap in .catch().
 */
export async function publishTapUpdate(
  redis: Redis,
  eventId: string,
  data: {
    totalTaps: number;
    uniqueTaps: number;
    mode: string;
  }
): Promise<void> {
  const channel = KEYS.tapChannel(eventId);
  const message = JSON.stringify(data);
  await redis.publish(channel, message);
}

/**
 * Subscribe to tap updates for a specific event.
 * Returns cleanup function that unsubscribes and disconnects.
 */
export function createTapSubscriber(
  eventId: string,
  onMessage: (data: { totalTaps: number; uniqueTaps: number; mode: string }) => void
): () => void {
  const subscriber = createSubscriberClient();
  const channel = KEYS.tapChannel(eventId);

  // Set up message listener BEFORE subscribing to avoid race condition
  subscriber.on("message", (ch, message) => {
    if (ch === channel) {
      try {
        const data = JSON.parse(message);
        onMessage(data);
      } catch (error) {
        console.error("Failed to parse tap update message:", error);
      }
    }
  });

  subscriber.subscribe(channel, (err) => {
    if (err) {
      console.error("Failed to subscribe:", err);
      return;
    }
  });

  // Return cleanup function
  return () => {
    subscriber.unsubscribe(channel);
    subscriber.disconnect();
  };
}
