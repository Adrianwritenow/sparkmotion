import { db } from "@sparkmotion/database";
import { invalidateEventCache, invalidateBandCache, invalidateBandCacheByEvent } from "@sparkmotion/redis";
import { generateRedirectMap, purgeEventFromKV } from "./redirect-map-generator";
import { evaluateEventSchedule } from "./evaluate-schedule";
import { TZDate } from "@date-fns/tz";

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

  // Idempotently disable autoLifecycle for non-campaign events (data migration cleanup)
  await db.event.updateMany({
    where: { autoLifecycle: true, campaignId: null },
    data: { autoLifecycle: false },
  });

  // Fetch all auto-lifecycle events (activation driven by window startTime, not event.startDate)
  const lifecycleEvents = await db.event.findMany({
    where: {
      autoLifecycle: true,
      deletedAt: null,
      status: { in: ["DRAFT", "ACTIVE"] },
    },
    select: { id: true, status: true, timezone: true, endDate: true, campaignId: true },
  });

  // Batch-load campaign event chains for all involved campaigns
  const campaignIds = [
    ...new Set(
      lifecycleEvents.map((e) => e.campaignId).filter((id): id is string => id !== null)
    ),
  ];

  const chainEvents = await db.event.findMany({
    where: {
      campaignId: { in: campaignIds },
      deletedAt: null,
      status: { in: ["DRAFT", "ACTIVE"] },
    },
    select: {
      id: true,
      campaignId: true,
      timezone: true,
      endDate: true,
      windows: {
        where: { startTime: { not: null } },
        select: { startTime: true },
        orderBy: { startTime: "asc" },
        take: 1,
      },
    },
  });

  // Build campaignChainMap: group by campaignId, sort by earliest window startTime ascending
  const campaignChainMap = new Map<string, typeof chainEvents>();
  for (const event of chainEvents) {
    if (!event.campaignId) continue;
    if (!campaignChainMap.has(event.campaignId)) {
      campaignChainMap.set(event.campaignId, []);
    }
    campaignChainMap.get(event.campaignId)!.push(event);
  }
  for (const [, events] of campaignChainMap) {
    events.sort((a, b) => {
      const aTime = a.windows[0]?.startTime?.getTime() ?? Infinity;
      const bTime = b.windows[0]?.startTime?.getTime() ?? Infinity;
      return aTime - bTime;
    });
  }

  for (const event of lifecycleEvents) {
    const now = new TZDate(new Date(), event.timezone);

    if (event.status === "DRAFT") {
      // Activation driven by earliest window startTime
      const chain = campaignChainMap.get(event.campaignId!);
      const thisInChain = chain?.find((e) => e.id === event.id);
      const earliestStartTime = thisInChain?.windows[0]?.startTime ?? null;

      if (!earliestStartTime) {
        console.warn(`[AutoLifecycle] ${event.id}: skipped — no window startTimes`);
        continue;
      }

      const activationTime = new TZDate(earliestStartTime, event.timezone);
      if (now >= activationTime) {
        await db.event.update({ where: { id: event.id }, data: { status: "ACTIVE" } });
        eventIdsToInvalidate.add(event.id);
        lifecycleTransitions++;
        console.log(`[AutoLifecycle] ${event.id}: DRAFT → ACTIVE`);

        db.changeLog.create({
          data: {
            userId: null,
            action: "event.autoLifecycle.draft_to_active",
            resource: "Event",
            resourceId: event.id,
            oldValue: { status: "DRAFT" } as any,
            newValue: { status: "ACTIVE" } as any,
            ipAddress: null,
            userAgent: "cron/auto-lifecycle",
          },
        }).catch(console.error);
      }
    } else if (event.status === "ACTIVE") {
      // Completion driven by next campaign event's earliest window startTime
      const chain = campaignChainMap.get(event.campaignId!);
      if (!chain) {
        console.warn(`[AutoLifecycle] ${event.id}: ACTIVE but no chain found — skipped`);
        continue;
      }

      const thisIndex = chain.findIndex((e) => e.id === event.id);
      if (thisIndex === -1) {
        // Event is ACTIVE but not in chain (chain only includes DRAFT/ACTIVE) — already transitioned or data inconsistency
        console.warn(`[AutoLifecycle] ${event.id}: not found in chain — skipped`);
        continue;
      }

      const nextEvent = chain[thisIndex + 1] ?? null;
      let shouldComplete = false;

      if (nextEvent) {
        const nextStartTime = nextEvent.windows[0]?.startTime ?? null;
        if (nextStartTime) {
          const nextEventActivation = new TZDate(nextStartTime, nextEvent.timezone);
          shouldComplete = now >= nextEventActivation;
        }
      } else {
        // Last event in chain: fall back to endDate at 23:59:59 in event timezone
        if (!event.endDate) {
          console.warn(`[AutoLifecycle] ${event.id}: last in chain, no endDate — skipped`);
          continue;
        }
        const endOfDay = new TZDate(
          event.endDate.getUTCFullYear(),
          event.endDate.getUTCMonth(),
          event.endDate.getUTCDate(),
          23, 59, 59,
          event.timezone
        );
        shouldComplete = now >= endOfDay;
      }

      if (shouldComplete) {
        await db.event.update({ where: { id: event.id }, data: { status: "COMPLETED" } });
        eventIdsToInvalidate.add(event.id);
        lifecycleTransitions++;
        console.log(`[AutoLifecycle] ${event.id}: ACTIVE → COMPLETED`);

        // Purge KV entries + invalidate band caches (same as CANCELLED flow)
        const eventWithOrg = await db.event.findUnique({
          where: { id: event.id },
          select: { org: { select: { slug: true } } },
        });
        const bands = await db.band.findMany({
          where: { eventId: event.id },
          select: { bandId: true },
        });
        const slug = eventWithOrg?.org.slug;
        Promise.all([
          purgeEventFromKV(event.id),
          ...(slug ? bands.map((b) => invalidateBandCache(slug, b.bandId)) : []),
          ...bands.map((b) => invalidateBandCacheByEvent(event.id, b.bandId)),
        ]).catch(console.error);

        db.changeLog.create({
          data: {
            userId: null,
            action: "event.autoLifecycle.active_to_completed",
            resource: "Event",
            resourceId: event.id,
            oldValue: { status: "ACTIVE" } as any,
            newValue: { status: "COMPLETED" } as any,
            ipAddress: null,
            userAgent: "cron/auto-lifecycle",
          },
        }).catch(console.error);
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
