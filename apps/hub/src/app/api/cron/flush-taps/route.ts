import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS } from "@sparkmotion/redis";
import { db } from "@sparkmotion/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 5000;

interface PendingTap {
  bandId: string; // NFC band ID string (e.g. "BAND-0001")
  eventId: string;
  mode: string;
  redirectUrl: string;
  userAgent?: string;
  ipAddress?: string;
  tappedAt: string; // ISO string
}

/**
 * Cron: Flush pending tap logs from Redis to DB in batches.
 *
 * Runs every minute. Drains up to BATCH_SIZE items per iteration,
 * loops until the list is empty or maxDuration is approaching.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  let totalFlushed = 0;
  let batchCount = 0;

  try {
    while (Date.now() - startTime < 50_000) {
      // Grab up to BATCH_SIZE items atomically
      const key = KEYS.tapLogPending();
      const items = await redis.lrange(key, 0, BATCH_SIZE - 1);

      if (items.length === 0) break;

      // Trim the items we just read
      await redis.ltrim(key, items.length, -1);

      // Parse tap entries
      const taps: PendingTap[] = items.map((item) =>
        typeof item === "string" ? JSON.parse(item) : item
      );

      // Resolve NFC bandId strings to internal CUIDs
      const uniqueBandIds = [...new Set(taps.map((t) => t.bandId))];
      const bands = await db.band.findMany({
        where: { bandId: { in: uniqueBandIds } },
        select: { id: true, bandId: true },
      });
      const bandIdMap = new Map(bands.map((b) => [b.bandId, b.id]));

      // Build TapLog rows (skip taps with unknown bands)
      const tapLogData = taps
        .filter((t) => bandIdMap.has(t.bandId))
        .map((t) => ({
          bandId: bandIdMap.get(t.bandId)!,
          eventId: t.eventId,
          modeServed: t.mode,
          redirectUrl: t.redirectUrl,
          userAgent: t.userAgent ?? null,
          ipAddress: t.ipAddress ?? null,
          tappedAt: new Date(t.tappedAt),
        }));

      if (tapLogData.length > 0) {
        await db.tapLog.createMany({ data: tapLogData });
      }

      // Aggregate per-band updates
      const bandAggregates = new Map<
        string,
        { tapCount: number; firstTapAt: Date; lastTapAt: Date }
      >();

      for (const tap of taps) {
        const internalId = bandIdMap.get(tap.bandId);
        if (!internalId) continue;

        const tappedAt = new Date(tap.tappedAt);
        const existing = bandAggregates.get(internalId);
        if (existing) {
          existing.tapCount++;
          if (tappedAt < existing.firstTapAt) existing.firstTapAt = tappedAt;
          if (tappedAt > existing.lastTapAt) existing.lastTapAt = tappedAt;
        } else {
          bandAggregates.set(internalId, {
            tapCount: 1,
            firstTapAt: tappedAt,
            lastTapAt: tappedAt,
          });
        }
      }

      // Batch update bands in a single transaction
      if (bandAggregates.size > 0) {
        const updates = Array.from(bandAggregates.entries());
        await db.$transaction([
          // Increment tapCount and update lastTapAt for all bands
          ...updates.map(([internalId, agg]) =>
            db.band.update({
              where: { id: internalId },
              data: {
                tapCount: { increment: agg.tapCount },
                lastTapAt: agg.lastTapAt,
              },
            })
          ),
          // Set firstTapAt only for bands that haven't been tapped before
          ...updates.map(([internalId, agg]) =>
            db.band.updateMany({
              where: { id: internalId, firstTapAt: null },
              data: { firstTapAt: agg.firstTapAt },
            })
          ),
        ]);
      }

      totalFlushed += taps.length;
      batchCount++;
    }

    console.log(
      `flush-taps: ${totalFlushed} taps flushed in ${batchCount} batches (${Date.now() - startTime}ms)`
    );

    return NextResponse.json({
      success: true,
      flushed: totalFlushed,
      batches: batchCount,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("flush-taps failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
