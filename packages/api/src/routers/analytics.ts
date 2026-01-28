import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getAnalytics } from "@sparkmotion/redis";
import { db } from "@sparkmotion/database";

export const analyticsRouter = router({
  realtime: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ input }) => {
      return getAnalytics(input.eventId);
    }),

  tapsByHour: protectedProcedure
    .input(z.object({ eventId: z.string(), hours: z.number().min(1).max(168).default(24) }))
    .query(async ({ input }) => {
      const since = new Date(Date.now() - input.hours * 60 * 60 * 1000);
      return db.tapLog.groupBy({
        by: ["modeServed"],
        where: { eventId: input.eventId, tappedAt: { gte: since } },
        _count: true,
      });
    }),

  eventSummary: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ input }) => {
      const [bandCount, tapCount, uniqueBands] = await Promise.all([
        db.band.count({ where: { eventId: input.eventId } }),
        db.tapLog.count({ where: { eventId: input.eventId } }),
        db.band.count({ where: { eventId: input.eventId, tapCount: { gt: 0 } } }),
      ]);
      return { bandCount, tapCount, uniqueBands };
    }),
});
