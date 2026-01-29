import { router, adminProcedure } from "../trpc";
import { db } from "@sparkmotion/database";

export const adminRouter = router({
  dashboardStats: adminProcedure.query(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [eventCount, bandCount, recentTaps] = await db.$transaction([
      db.event.count(),
      db.band.count(),
      db.tapLog.count({ where: { tappedAt: { gte: since } } }),
    ]);

    return { eventCount, bandCount, recentTaps };
  }),
});
