import { db, Prisma } from "@sparkmotion/database";

export interface EngagementResult {
  engagementPercent: number;
  totalTaps: number;
  uniqueBands: number;
}

/**
 * Batch-compute engagement for a set of events.
 *
 * Formula: uniqueBands / estimatedAttendees * 100
 * When estimatedAttendees is null or 0, engagementPercent = 0.
 */
export async function getEventEngagement(
  eventIds: string[],
  estimatedAttendeesByEvent: Map<string, number | null>
): Promise<Map<string, EngagementResult>> {
  const result = new Map<string, EngagementResult>();

  if (eventIds.length === 0) return result;

  // Merge purged history from AnalyticsSummary (daily rollup). Taps older than
  // the 90d retention window are aggregated there per-event/day; the seam is the
  // oldest surviving raw tap per event (TapLog owns >= seam, summary owns < seam).
  // total_taps is exact; unique_bands is an upper bound (daily uniques can't
  // dedupe cross-day) — engagementPercent is clamped to 100 below.
  const rows = await db.$queryRaw<
    Array<{
      eventId: string;
      total_taps: number;
      unique_bands: number;
    }>
  >(Prisma.sql`
    SELECT "eventId", SUM(total_taps)::int AS total_taps, SUM(unique_bands)::int AS unique_bands FROM (
      SELECT
        tl."eventId" AS "eventId",
        COUNT(DISTINCT (tl."bandId", tl."tappedAt")) AS total_taps,
        COUNT(DISTINCT tl."bandId") AS unique_bands
      FROM "TapLog" tl
      INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
      WHERE tl."eventId" IN (${Prisma.join(eventIds)})
      GROUP BY tl."eventId"
      UNION ALL
      SELECT
        s."eventId" AS "eventId",
        SUM(s."tapCount") AS total_taps,
        SUM(s."uniqueBands") AS unique_bands
      FROM "AnalyticsSummary" s
      LEFT JOIN (
        SELECT "eventId", MIN("tappedAt")::date AS d FROM "TapLog" GROUP BY "eventId"
      ) seam ON seam."eventId" = s."eventId"
      WHERE s."eventId" IN (${Prisma.join(eventIds)})
        AND s."date" < COALESCE(seam.d, 'infinity'::date)
      GROUP BY s."eventId"
    ) u
    GROUP BY "eventId"
  `);

  for (const row of rows) {
    const estimatedAttendees = estimatedAttendeesByEvent.get(row.eventId) ?? null;
    const engagementPercent = estimatedAttendees && estimatedAttendees > 0
      ? Math.min(100, Math.round((row.unique_bands / estimatedAttendees) * 100))
      : 0;

    result.set(row.eventId, {
      engagementPercent,
      totalTaps: row.total_taps,
      uniqueBands: row.unique_bands,
    });
  }

  return result;
}

export interface CampaignEngagementResult {
  aggregateEngagement: number;
  totalEstimatedAttendees: number;
  totalTaps: number;
}

/**
 * Aggregate engagement across all events in a campaign.
 *
 * Formula: SUM(uniqueBands) / SUM(estimatedAttendees) * 100
 * Events with null estimatedAttendees are skipped in the denominator.
 * When total is 0, aggregateEngagement = 0.
 */
export function aggregateCampaignEngagement(
  campaignEvents: Array<{ id: string; estimatedAttendees: number | null }>,
  engagementMap: Map<string, EngagementResult>,
): CampaignEngagementResult {
  let totalUniqueBands = 0;
  let totalEstimatedAttendees = 0;
  let totalTaps = 0;

  for (const event of campaignEvents) {
    const eng = engagementMap.get(event.id);
    if (event.estimatedAttendees != null) {
      totalEstimatedAttendees += event.estimatedAttendees;
    }
    if (eng) {
      totalUniqueBands += eng.uniqueBands;
      totalTaps += eng.totalTaps;
    }
  }

  const aggregateEngagement = totalEstimatedAttendees > 0
    ? Math.round((totalUniqueBands / totalEstimatedAttendees) * 100)
    : 0;

  return { aggregateEngagement, totalEstimatedAttendees, totalTaps };
}
