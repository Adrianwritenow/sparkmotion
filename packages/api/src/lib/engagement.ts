import { db, Prisma } from "@sparkmotion/database";

export interface EngagementResult {
  engagementPercent: number;
  totalTaps: number;
  uniqueBands: number;
}

/**
 * Batch-compute engagement for a set of events.
 *
 * Formula: uniqueBands / totalBands * 100
 */
export async function getEventEngagement(
  eventIds: string[],
  bandCountByEvent: Map<string, number>
): Promise<Map<string, EngagementResult>> {
  const result = new Map<string, EngagementResult>();

  if (eventIds.length === 0) return result;

  const rows = await db.$queryRaw<
    Array<{
      eventId: string;
      total_taps: number;
      unique_bands: number;
    }>
  >(Prisma.sql`
    SELECT
      tl."eventId",
      COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS total_taps,
      COUNT(DISTINCT tl."bandId")::int AS unique_bands
    FROM "TapLog" tl
    INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
    WHERE tl."eventId" IN (${Prisma.join(eventIds)})
    GROUP BY tl."eventId"
  `);

  for (const row of rows) {
    const totalBands = bandCountByEvent.get(row.eventId) ?? 0;
    const engagementPercent = totalBands > 0
      ? Math.round((row.unique_bands / totalBands) * 100)
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
  totalBands: number;
  totalTaps: number;
}

/**
 * Aggregate engagement across all events in a campaign.
 *
 * Formula: SUM(uniqueBands) / SUM(totalBands) * 100
 */
export function aggregateCampaignEngagement(
  campaignEvents: Array<{ id: string; _count: { bands: number } }>,
  engagementMap: Map<string, EngagementResult>,
): CampaignEngagementResult {
  let totalUniqueBands = 0;
  let totalBands = 0;
  let totalTaps = 0;

  for (const event of campaignEvents) {
    const eng = engagementMap.get(event.id);
    totalBands += event._count.bands;
    if (eng) {
      totalUniqueBands += eng.uniqueBands;
      totalTaps += eng.totalTaps;
    }
  }

  const aggregateEngagement = totalBands > 0
    ? Math.round((totalUniqueBands / totalBands) * 100)
    : 0;

  return { aggregateEngagement, totalBands, totalTaps };
}
