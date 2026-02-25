import { db } from "@sparkmotion/database";
import { invalidateEventCache } from "@sparkmotion/redis";
import { generateRedirectMap } from "./redirect-map-generator";
import { evaluateEventSchedule } from "./evaluate-schedule";

/**
 * Updates EventWindow active states based on current time and event schedules.
 *
 * Only processes events with scheduleMode: true.
 * Delegates per-event evaluation to the shared evaluateEventSchedule helper.
 * Invalidates Redis cache and regenerates redirect map for affected events.
 *
 * @returns Object with counts: eventsProcessed, eventsChanged, redirectMap
 */
export async function updateEventWindows() {
  const eventIdsToInvalidate = new Set<string>();

  // Fetch all events with schedule mode enabled
  const scheduledEvents = await db.event.findMany({
    where: { scheduleMode: true },
    select: { id: true, timezone: true },
  });

  // Evaluate each event using the shared helper
  for (const event of scheduledEvents) {
    const result = await evaluateEventSchedule(db, event.id, event.timezone);
    if (result.changed) {
      eventIdsToInvalidate.add(event.id);
    }
  }

  // Invalidate cache once per affected event
  if (eventIdsToInvalidate.size > 0) {
    await Promise.allSettled(
      Array.from(eventIdsToInvalidate).map((eventId) => invalidateEventCache(eventId))
    );
  }

  // Fire-and-forget Cloudflare KV redirect map regeneration for affected events.
  // Awaiting this blocks the cron — up to 60 sequential API calls for multiple events
  // with 200K bands. The Worker falls back to Hub on KV miss, so brief staleness is fine.
  if (eventIdsToInvalidate.size > 0) {
    generateRedirectMap({
      eventIds: Array.from(eventIdsToInvalidate),
    }).catch((error) => {
      console.error("Redirect map generation failed:", error);
    });
  }

  return {
    eventsProcessed: scheduledEvents.length,
    eventsChanged: eventIdsToInvalidate.size,
  };
}
