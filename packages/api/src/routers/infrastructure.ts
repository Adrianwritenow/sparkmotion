import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
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

});
