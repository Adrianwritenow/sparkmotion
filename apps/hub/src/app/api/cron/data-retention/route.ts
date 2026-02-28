import { NextRequest, NextResponse } from "next/server";
import { db, Prisma } from "@sparkmotion/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 90;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  let aggregatedCount = 0;
  let deletedTapLogs = 0;
  let deletedTokens = 0;
  let purgedBands = 0;
  let purgedEvents = 0;
  let purgedCampaigns = 0;
  let purgedOrgs = 0;

  try {
    // Step 1: Aggregate expired TapLogs into AnalyticsSummary
    const expiredAggregates = await db.$queryRaw<
      Array<{
        date: Date;
        eventId: string;
        windowId: string | null;
        redirectUrl: string | null;
        tapCount: bigint;
        uniqueBands: bigint;
      }>
    >(Prisma.sql`
      SELECT
        DATE("tappedAt") as date,
        "eventId",
        "windowId",
        "redirectUrl",
        COUNT(*)::bigint as "tapCount",
        COUNT(DISTINCT "bandId")::bigint as "uniqueBands"
      FROM "TapLog"
      WHERE "tappedAt" < ${cutoffDate}
      GROUP BY DATE("tappedAt"), "eventId", "windowId", "redirectUrl"
    `);

    if (expiredAggregates.length > 0) {
      // Upsert aggregates into AnalyticsSummary (idempotent)
      for (const agg of expiredAggregates) {
        await db.analyticsSummary.upsert({
          where: {
            date_eventId_windowId_redirectUrl: {
              date: agg.date,
              eventId: agg.eventId,
              windowId: agg.windowId ?? "",
              redirectUrl: agg.redirectUrl ?? "",
            },
          },
          create: {
            date: agg.date,
            eventId: agg.eventId,
            windowId: agg.windowId ?? "",
            redirectUrl: agg.redirectUrl ?? "",
            tapCount: Number(agg.tapCount),
            uniqueBands: Number(agg.uniqueBands),
          },
          update: {
            tapCount: { increment: Number(agg.tapCount) },
            uniqueBands: Number(agg.uniqueBands),
          },
        });
        aggregatedCount++;
      }

      // Step 2: Delete aggregated TapLogs
      const deleteResult = await db.tapLog.deleteMany({
        where: { tappedAt: { lt: cutoffDate } },
      });
      deletedTapLogs = deleteResult.count;
    }

    // Step 3: Clean up expired/used password reset tokens
    const tokenDeleteResult = await db.passwordResetToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { usedAt: { not: null } },
        ],
      },
    });
    deletedTokens = tokenDeleteResult.count;

    // Step 4: Hard-delete soft-deleted records older than 30 days (SOC2 compliant purge)
    const softDeleteCutoff = new Date();
    softDeleteCutoff.setDate(softDeleteCutoff.getDate() - 30);

    // FK-safe order: TapLogs for deleted bands, then Bands -> Events -> Campaigns -> Orgs
    const deletedBandIds = await db.band.findMany({
      where: { deletedAt: { lt: softDeleteCutoff } },
      select: { id: true },
    });
    if (deletedBandIds.length > 0) {
      await db.tapLog.deleteMany({
        where: { bandId: { in: deletedBandIds.map((b) => b.id) } },
      });
    }

    const r1 = await db.band.deleteMany({ where: { deletedAt: { lt: softDeleteCutoff } } });
    purgedBands = r1.count;

    const r2 = await db.event.deleteMany({ where: { deletedAt: { lt: softDeleteCutoff } } });
    purgedEvents = r2.count;

    const r3 = await db.campaign.deleteMany({ where: { deletedAt: { lt: softDeleteCutoff } } });
    purgedCampaigns = r3.count;

    const r4 = await db.organization.deleteMany({ where: { deletedAt: { lt: softDeleteCutoff } } });
    purgedOrgs = r4.count;

    console.log(
      `data-retention: aggregated=${aggregatedCount} summaries, ` +
        `deleted=${deletedTapLogs} tap logs, ` +
        `cleaned=${deletedTokens} tokens, ` +
        `purged=${purgedBands} bands/${purgedEvents} events/${purgedCampaigns} campaigns/${purgedOrgs} orgs ` +
        `(${Date.now() - startTime}ms)`
    );

    return NextResponse.json({
      success: true,
      aggregatedSummaries: aggregatedCount,
      deletedTapLogs,
      deletedTokens,
      purgedBands,
      purgedEvents,
      purgedCampaigns,
      purgedOrgs,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("data-retention cron failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
