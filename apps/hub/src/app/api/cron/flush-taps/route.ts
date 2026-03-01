import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS } from "@sparkmotion/redis";
import { db, Prisma } from "@sparkmotion/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50_000;
const BACKLOG_WARN_THRESHOLD = 500_000;

interface PendingTap {
  bandId: string; // NFC band ID string (e.g. "BAND-0001")
  eventId: string;
  mode: string;
  windowId?: string;
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
 *
 * If a batch's DB write fails, the drained items are re-queued to Redis
 * so they're retried next cycle instead of lost.
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
  let failedBatches = 0;

  const key = KEYS.tapLogPending();

  try {
    // Check backlog size before starting
    const backlogSize = await redis.llen(key);
    if (backlogSize > BACKLOG_WARN_THRESHOLD) {
      console.error(
        `CRITICAL flush-taps: backlog=${backlogSize} exceeds ${BACKLOG_WARN_THRESHOLD} threshold`
      );
    } else if (backlogSize > 0) {
      console.log(`flush-taps: starting with backlog=${backlogSize}`);
    }

    // Lua script: atomically read and remove up to BATCH_SIZE items from the list.
    // Returns the items that were removed — no race condition with overlapping crons.
    const DRAIN_SCRIPT = `
      local key = KEYS[1]
      local count = tonumber(ARGV[1])
      local items = redis.call('lrange', key, 0, count - 1)
      if #items > 0 then
        redis.call('ltrim', key, #items, -1)
      end
      return items
    `;

    while (Date.now() - startTime < 50_000) {
      // Atomically drain up to BATCH_SIZE items
      const items = (await redis.eval(DRAIN_SCRIPT, 1, key, BATCH_SIZE)) as string[];

      if (!items || items.length === 0) break;

      try {
        // Parse tap entries
        const taps: PendingTap[] = items.map((item) =>
          typeof item === "string" ? JSON.parse(item) : item
        );

        // Resolve NFC bandId strings to internal CUIDs
        const uniqueBandIds = [...new Set(taps.map((t) => t.bandId))];
        const bands = await db.band.findMany({
          where: { bandId: { in: uniqueBandIds }, deletedAt: null },
          select: { id: true, bandId: true },
        });
        const bandIdMap = new Map(bands.map((b) => [b.bandId, b.id]));

        // Build TapLog rows (skip taps with unknown bands)
        const tapLogData = taps
          .filter((t) => bandIdMap.has(t.bandId))
          .map((t) => ({
            bandId: bandIdMap.get(t.bandId)!,
            eventId: t.eventId,
            windowId: t.windowId ?? null,
            modeServed: t.mode,
            redirectUrl: t.redirectUrl,
            userAgent: t.userAgent ?? null,
            ipAddress: t.ipAddress ?? null,
            tappedAt: new Date(t.tappedAt),
          }));

        const droppedCount = taps.length - tapLogData.length;
        if (droppedCount > 0) {
          console.warn(`flush-taps: ${droppedCount} taps dropped (unknown bandIds)`);
        }

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

        // Batch update bands with two raw SQL queries instead of 2N individual updates
        if (bandAggregates.size > 0) {
          const updates = Array.from(bandAggregates.entries());
          const ids = updates.map(([id]) => id);
          const tapCounts = updates.map(([, agg]) => agg.tapCount);
          const lastTapAts = updates.map(([, agg]) => agg.lastTapAt);
          const firstTapAts = updates.map(([, agg]) => agg.firstTapAt);

          await db.$transaction([
            // Single UPDATE for tapCount + lastTapAt using unnest arrays
            db.$executeRaw(Prisma.sql`
              UPDATE "Band" AS b SET
                "tapCount" = b."tapCount" + v."inc",
                "lastTapAt" = GREATEST(b."lastTapAt", v."last_tap")
              FROM (
                SELECT unnest(${ids}::text[]) AS id,
                       unnest(${tapCounts}::int[]) AS inc,
                       unnest(${lastTapAts}::timestamptz[]) AS last_tap
              ) AS v
              WHERE b."id" = v."id"
            `),
            // Single UPDATE for firstTapAt (only where null)
            db.$executeRaw(Prisma.sql`
              UPDATE "Band" AS b SET
                "firstTapAt" = v."first_tap"
              FROM (
                SELECT unnest(${ids}::text[]) AS id,
                       unnest(${firstTapAts}::timestamptz[]) AS first_tap
              ) AS v
              WHERE b."id" = v."id" AND b."firstTapAt" IS NULL
            `),
          ]);
        }

        totalFlushed += taps.length;
        batchCount++;
      } catch (batchError) {
        failedBatches++;
        console.error(
          `flush-taps: batch ${batchCount + 1} failed, re-queuing ${items.length} items:`,
          batchError
        );

        // Re-queue drained items back to Redis so they're retried next cycle
        const pipeline = redis.pipeline();
        for (const item of items) {
          pipeline.rpush(key, item);
        }
        await pipeline.exec();
      }
    }

    const remaining = await redis.llen(key);

    console.log(
      `flush-taps: ${totalFlushed} taps flushed in ${batchCount} batches, ` +
        `${failedBatches} failed, ${remaining} remaining (${Date.now() - startTime}ms)`
    );

    return NextResponse.json({
      success: true,
      flushed: totalFlushed,
      batches: batchCount,
      failedBatches,
      remaining,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    console.error("flush-taps failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
