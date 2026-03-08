import { db } from "@sparkmotion/database";
import { invalidateEventCache, invalidateBandCache } from "@sparkmotion/redis";
import { generateRedirectMap, purgeEventFromKV } from "./redirect-map-generator";
import { evaluateEventSchedule } from "./evaluate-schedule";
import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";

/**
 * Updates EventWindow active states based on current time and event schedules.
 *
 * Only processes events with scheduleMode: true.
 * Delegates per-event evaluation to the shared evaluateEventSchedule helper.
 * Invalidates Redis cache and regenerates redirect map for affected events.
 *
 * @returns Object with counts: eventsProcessed, eventsChanged, lifecycleTransitions
 */
export async function updateEventWindows() {
  const eventIdsToInvalidate = new Set<string>();

  // Fetch all events with schedule mode enabled
  const scheduledEvents = await db.event.findMany({
    where: { scheduleMode: true, deletedAt: null },
    select: { id: true, timezone: true },
  });

  // Evaluate each event using the shared helper
  for (const event of scheduledEvents) {
    const result = await evaluateEventSchedule(db, event.id, event.timezone);
    if (result.changed) {
      eventIdsToInvalidate.add(event.id);
    }
  }

  // --- Auto-Lifecycle Phase ---
  let lifecycleTransitions = 0;
  const lifecycleEvents = await db.event.findMany({
    where: {
      autoLifecycle: true,
      deletedAt: null,
      status: { in: ["DRAFT", "ACTIVE"] },
      startDate: { not: null },
    },
    select: { id: true, status: true, timezone: true, startDate: true, endDate: true },
  });

  for (const event of lifecycleEvents) {
    const now = new TZDate(new Date(), event.timezone);
    const startDate = new TZDate(event.startDate!, event.timezone);

    if (event.status === "DRAFT" && now >= startDate) {
      await db.event.update({ where: { id: event.id }, data: { status: "ACTIVE" } });
      eventIdsToInvalidate.add(event.id);
      lifecycleTransitions++;
      console.log(`[AutoLifecycle] ${event.id}: DRAFT → ACTIVE`);
    } else if (event.status === "ACTIVE") {
      // endDate represents "through the end of that day", so add 1 day
      // e.g. endDate Mar 8 → completes after midnight Mar 9 (full day used)
      const effectiveEndDate = event.endDate
        ? addDays(new TZDate(event.endDate, event.timezone), 1)
        : addDays(startDate, 1);

      if (now >= effectiveEndDate) {
        await db.event.update({ where: { id: event.id }, data: { status: "COMPLETED" } });
        eventIdsToInvalidate.add(event.id);
        lifecycleTransitions++;
        console.log(`[AutoLifecycle] ${event.id}: ACTIVE → COMPLETED`);

        // Purge KV entries + invalidate band caches (same as CANCELLED flow)
        const bands = await db.band.findMany({
          where: { eventId: event.id },
          select: { bandId: true },
        });
        Promise.all([
          purgeEventFromKV(event.id),
          ...bands.map((b) => invalidateBandCache(b.bandId)),
        ]).catch(console.error);
      }
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
    lifecycleTransitions,
  };
}
