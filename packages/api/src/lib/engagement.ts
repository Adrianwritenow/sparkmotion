import { db, Prisma } from "@sparkmotion/database";

export interface EngagementResult {
  engagementPercent: number;
  totalTaps: number;
  elapsedWindows: number;
  engagedPairs: number;
}

/**
 * Batch-compute engagement for a set of events.
 *
 * Primary formula (when elapsed windows exist):
 *   distinctBandWindowPairs / (totalBands * elapsedWindowCount) * 100
 *
 * Fallback formula (when event has zero windows):
 *   uniqueBands / totalBands * 100
 *
 * A window is "elapsed" if ANY of:
 * - startTime <= NOW() (scheduled and started/completed)
 * - isActive = true (manually activated)
 * - Has at least one TapLog with its windowId (was active at some point)
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
      window_count: number;
      pair_count: number;
    }>
  >(Prisma.sql`
    WITH tap_stats AS (
      SELECT
        "eventId",
        COUNT(*)::int AS total_taps,
        COUNT(DISTINCT "bandId")::int AS unique_bands
      FROM "TapLog"
      WHERE "eventId" IN (${Prisma.join(eventIds)})
      GROUP BY "eventId"
    ),
    elapsed_windows AS (
      SELECT ew."id", ew."eventId"
      FROM "EventWindow" ew
      WHERE ew."eventId" IN (${Prisma.join(eventIds)})
        AND (
          (ew."startTime" IS NOT NULL AND ew."startTime" <= NOW())
          OR ew."isActive" = true
          OR EXISTS (SELECT 1 FROM "TapLog" tl WHERE tl."windowId" = ew."id")
        )
    ),
    elapsed_counts AS (
      SELECT "eventId", COUNT(*)::int AS window_count
      FROM elapsed_windows
      GROUP BY "eventId"
    ),
    pair_counts AS (
      SELECT t."eventId", COUNT(DISTINCT (t."bandId", t."windowId"))::int AS pair_count
      FROM "TapLog" t
      WHERE t."eventId" IN (${Prisma.join(eventIds)})
        AND t."windowId" IS NOT NULL
      GROUP BY t."eventId"
    )
    SELECT
      ts."eventId",
      ts.total_taps,
      ts.unique_bands,
      COALESCE(ec.window_count, 0)::int AS window_count,
      COALESCE(pc.pair_count, 0)::int AS pair_count
    FROM tap_stats ts
    LEFT JOIN elapsed_counts ec ON ec."eventId" = ts."eventId"
    LEFT JOIN pair_counts pc ON pc."eventId" = ts."eventId"
  `);

  for (const row of rows) {
    const totalBands = bandCountByEvent.get(row.eventId) ?? 0;

    // Window-based engagement when elapsed windows exist, else fall back to unique bands
    let engagementPercent = 0;
    if (row.window_count > 0) {
      const denominator = totalBands * row.window_count;
      engagementPercent = denominator > 0 ? Math.round((row.pair_count / denominator) * 100) : 0;
    } else if (totalBands > 0) {
      engagementPercent = Math.round((row.unique_bands / totalBands) * 100);
    }

    result.set(row.eventId, {
      engagementPercent,
      totalTaps: row.total_taps,
      elapsedWindows: row.window_count,
      engagedPairs: row.pair_count,
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
 * Window-based: SUM(engagedPairs) / SUM(bandsPerEvent * elapsedWindowsPerEvent) * 100
 * Fallback: SUM(engagedPairs) / SUM(bandsPerEvent) * 100 (when no windows)
 */
export function aggregateCampaignEngagement(
  campaignEvents: Array<{ id: string; _count: { bands: number } }>,
  engagementMap: Map<string, EngagementResult>,
): CampaignEngagementResult {
  let totalPairs = 0;
  let totalWindowDenominator = 0;
  let totalBands = 0;
  let totalTaps = 0;
  let hasWindows = false;

  for (const event of campaignEvents) {
    const eng = engagementMap.get(event.id);
    totalBands += event._count.bands;
    if (eng) {
      totalPairs += eng.engagedPairs;
      totalTaps += eng.totalTaps;
      if (eng.elapsedWindows > 0) {
        hasWindows = true;
        totalWindowDenominator += event._count.bands * eng.elapsedWindows;
      }
    }
  }

  let aggregateEngagement = 0;
  if (hasWindows && totalWindowDenominator > 0) {
    aggregateEngagement = Math.round((totalPairs / totalWindowDenominator) * 100);
  } else if (totalBands > 0) {
    aggregateEngagement = Math.round((totalPairs / totalBands) * 100);
  }

  return { aggregateEngagement, totalBands, totalTaps };
}
