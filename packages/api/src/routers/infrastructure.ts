import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { db } from "@sparkmotion/database";
import { redis } from "@sparkmotion/redis";
import { generateRedirectMap } from "../services/redirect-map-generator";

// Redis key for redirect map metadata
const REDIRECT_MAP_META_KEY = "redirect-map:meta";

// Stale threshold (5 minutes in milliseconds)
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export const infrastructureRouter = router({
  /**
   * Get redirect map metadata (lastRefreshed, bandCount, sizeBytes)
   */
  getMapStatus: adminProcedure.query(async () => {
    try {
      const metaJson = await redis.get(REDIRECT_MAP_META_KEY);

      if (!metaJson) {
        return {
          lastRefreshed: null,
          bandCount: 0,
          sizeBytes: 0,
          isStale: true,
        };
      }

      const meta = JSON.parse(metaJson) as {
        lastRefreshed: string;
        bandCount: number;
        sizeBytes: number;
      };

      const lastRefreshedDate = new Date(meta.lastRefreshed);
      const isStale = Date.now() - lastRefreshedDate.getTime() > STALE_THRESHOLD_MS;

      return {
        lastRefreshed: meta.lastRefreshed,
        bandCount: meta.bandCount,
        sizeBytes: meta.sizeBytes,
        isStale,
      };
    } catch (error) {
      console.error("Redis get error:", error);
      return {
        lastRefreshed: null,
        bandCount: 0,
        sizeBytes: 0,
        isStale: true,
      };
    }
  }),

  /**
   * Trigger redirect map refresh (syncs active bands to Cloudflare KV)
   */
  refreshMap: adminProcedure.mutation(async () => {
    try {
      const result = await generateRedirectMap();

      if (result.skipped) {
        return {
          success: true,
          bandsWritten: 0,
          eventsProcessed: 0,
          skipped: true,
        };
      }

      // Update metadata in Redis
      const meta = {
        lastRefreshed: new Date().toISOString(),
        bandCount: result.bandsWritten,
        sizeBytes: result.bandsWritten * 100, // Rough estimate: ~100 bytes per entry
      };

      await redis.set(REDIRECT_MAP_META_KEY, JSON.stringify(meta));

      return {
        success: true,
        bandsWritten: result.bandsWritten,
        eventsProcessed: result.eventsProcessed,
        skipped: false,
      };
    } catch (error) {
      console.error("Redirect map refresh error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to refresh redirect map",
      });
    }
  }),

  /**
   * Project costs based on upcoming events with estimatedAttendees
   * Uses Cloudflare Workers + KV pricing model
   */
  costProjection: adminProcedure
    .input(
      z.object({
        days: z.enum(["7", "14", "30"]),
      })
    )
    .query(async ({ input }) => {
      const daysNum = parseInt(input.days, 10);
      const now = new Date();
      const endDate = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000);

      const upcomingEvents = await db.event.findMany({
        where: {
          status: "ACTIVE",
          estimatedAttendees: { not: null },
          windows: {
            some: {
              startTime: {
                gte: now,
                lte: endDate,
              },
            },
          },
        },
        include: {
          windows: {
            where: {
              startTime: {
                gte: now,
                lte: endDate,
              },
            },
            orderBy: { startTime: "asc" },
          },
        },
      });

      const totalEstimatedAttendees = upcomingEvents.reduce(
        (sum, event) => sum + (event.estimatedAttendees ?? 0),
        0
      );

      const uniqueEventDays = new Set<string>();
      for (const event of upcomingEvents) {
        for (const window of event.windows) {
          if (window.startTime) {
            const dateStr = window.startTime.toISOString().split("T")[0];
            if (dateStr) {
              uniqueEventDays.add(dateStr);
            }
          }
        }
      }

      // Each attendee taps once per window
      const totalExpectedTaps = upcomingEvents.reduce(
        (sum, event) => sum + (event.estimatedAttendees ?? 0) * event.windows.length,
        0
      );
      const totalWindows = upcomingEvents.reduce((sum, event) => sum + event.windows.length, 0);

      // Cloudflare Workers: $0.50 per million requests (paid plan)
      const workersCost = (totalExpectedTaps / 1_000_000) * 0.50;

      // Cloudflare KV: $0.50 per million reads (1 read per redirect)
      const kvCost = (totalExpectedTaps / 1_000_000) * 0.50;

      // Upstash Redis: ~$0.20 per 100K commands, 9 commands per tap (8 pipeline + 1 publish)
      const upstashCost = ((totalExpectedTaps * 9) / 100_000) * 0.20;

      const totalCost = workersCost + kvCost + upstashCost;

      return {
        upcomingEvents: upcomingEvents.map((e) => ({
          id: e.id,
          name: e.name,
          estimatedAttendees: e.estimatedAttendees,
          windowCount: e.windows.length,
        })),
        totalEstimatedAttendees,
        totalExpectedTaps,
        totalWindows,
        uniqueEventDays: uniqueEventDays.size,
        workersCost: Math.round(workersCost * 100) / 100,
        kvCost: Math.round(kvCost * 100) / 100,
        upstashCost: Math.round(upstashCost * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        projectionDays: daysNum,
      };
    }),
});
