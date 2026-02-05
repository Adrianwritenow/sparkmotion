import { db } from "@sparkmotion/database";
import { invalidateEventCache } from "@sparkmotion/redis";
import { generateRedirectMap } from "./redirect-map-generator";

/**
 * Updates EventWindow active states based on current time.
 *
 * Activates windows where:
 * - isManual = false
 * - isActive = false
 * - startTime <= now
 * - endTime >= now OR endTime is null
 *
 * Deactivates windows where:
 * - isManual = false
 * - isActive = true
 * - endTime < now
 *
 * Invalidates Redis cache for all affected events.
 *
 * @returns Object with counts: activated, deactivated, eventsInvalidated
 */
export async function updateEventWindows() {
  const now = new Date();
  const eventIdsToInvalidate = new Set<string>();

  // Find windows that should become active
  const shouldActivate = await db.eventWindow.findMany({
    where: {
      isManual: false,
      isActive: false,
      startTime: { lte: now },
      OR: [
        { endTime: { gte: now } },
        { endTime: null } // Never-ending windows
      ]
    },
    select: { id: true, eventId: true }
  });

  // Find windows that should become inactive
  const shouldDeactivate = await db.eventWindow.findMany({
    where: {
      isManual: false,
      isActive: true,
      endTime: { lt: now }
    },
    select: { id: true, eventId: true }
  });

  // Activate windows
  if (shouldActivate.length > 0) {
    await db.eventWindow.updateMany({
      where: { id: { in: shouldActivate.map(w => w.id) } },
      data: { isActive: true }
    });
    shouldActivate.forEach(w => eventIdsToInvalidate.add(w.eventId));
  }

  // Deactivate windows
  if (shouldDeactivate.length > 0) {
    await db.eventWindow.updateMany({
      where: { id: { in: shouldDeactivate.map(w => w.id) } },
      data: { isActive: false }
    });
    shouldDeactivate.forEach(w => eventIdsToInvalidate.add(w.eventId));
  }

  // Invalidate cache once per affected event
  await Promise.all(
    Array.from(eventIdsToInvalidate).map(eventId =>
      invalidateEventCache(eventId)
    )
  );

  // Regenerate Cloudflare KV redirect map only for affected events
  let redirectMapResult = { bandsWritten: 0, eventsProcessed: 0, skipped: true };
  if (eventIdsToInvalidate.size > 0) {
    try {
      redirectMapResult = await generateRedirectMap({
        eventIds: Array.from(eventIdsToInvalidate),
      });
    } catch (error) {
      console.error("Redirect map generation failed:", error);
      // Non-fatal: redirects continue working with stale KV data
    }
  }

  return {
    activated: shouldActivate.length,
    deactivated: shouldDeactivate.length,
    eventsInvalidated: eventIdsToInvalidate.size,
    redirectMap: redirectMapResult,
  };
}
