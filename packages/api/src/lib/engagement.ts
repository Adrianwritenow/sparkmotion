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
    const estimatedAttendees = estimatedAttendeesByEvent.get(row.eventId) ?? null;
    const engagementPercent = estimatedAttendees && estimatedAttendees > 0
      ? Math.round((row.unique_bands / estimatedAttendees) * 100)
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
