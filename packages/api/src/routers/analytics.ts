import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getVelocityHistory, getAnalytics, getHourlyAnalytics } from "@sparkmotion/redis";
import { db } from "@sparkmotion/database";
import { Prisma } from "@sparkmotion/database";
import { TRPCError } from "@trpc/server";

// Shared input schema for date range queries
const dateRangeInput = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  eventId: z.string().optional(),
  orgId: z.string().optional(),
});

export const analyticsRouter = router({
  velocityHistory: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: input.eventId },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      return getVelocityHistory(input.eventId);
    }),

  tapsByHour: protectedProcedure
    .input(z.object({ eventId: z.string(), hours: z.number().min(1).max(168).default(24) }))
    .query(async ({ input }) => {
      return getHourlyAnalytics(input.eventId, input.hours);
    }),

  eventSummary: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ input }) => {
      const [redisAnalytics, bandCount] = await Promise.all([
        getAnalytics(input.eventId),
        db.band.count({ where: { eventId: input.eventId } }),
      ]);
      return {
        bandCount,
        tapCount: redisAnalytics.totalTaps,
        uniqueBands: redisAnalytics.uniqueTaps,
      };
    }),

  kpis: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const { from, to, eventId, orgId } = input;
      const fromDate = new Date(from);
      const toDate = new Date(to);

      // Redis fast-path: single event with date range including "now"
      const now = new Date();
      const isLive = eventId && toDate >= now && fromDate <= now;

      if (isLive) {
        const [redisAnalytics, totalBands] = await Promise.all([
          getAnalytics(eventId),
          db.band.count({ where: { eventId } }),
        ]);

        const { totalTaps, uniqueTaps, byMode } = redisAnalytics;
        const minutesInRange = Math.max(1, (now.getTime() - fromDate.getTime()) / 60000);
        const tpm = Math.round((totalTaps / minutesInRange) * 100) / 100;
        const bandActivityPercent = totalBands > 0
          ? Math.round((uniqueTaps / totalBands) * 100)
          : 0;
        const avgTapsPerBand = uniqueTaps > 0
          ? Math.round((totalTaps / uniqueTaps) * 100) / 100
          : 0;

        return {
          totalTaps,
          uniqueBands: uniqueTaps,
          activeEvents: 1,
          tpm,
          peakTpm: 0, // Not available from Redis — acceptable for live view
          bandActivityPercent,
          avgTapsPerBand,
          modeDistribution: {
            PRE: byMode.pre,
            LIVE: byMode.live,
            POST: byMode.post,
          },
        };
      }

      // DB path: historical/cross-event reports
      // Build base where clause for date range
      const dateWhere: Prisma.TapLogWhereInput = {
        tappedAt: {
          gte: fromDate,
          lte: toDate,
        },
      };

      // Apply org-scoping for CUSTOMER role
      let eventWhere: Prisma.EventWhereInput = {};
      if (ctx.user.role === "CUSTOMER") {
        eventWhere.orgId = ctx.user.orgId!;
      } else if (ctx.user.role === "ADMIN" && orgId) {
        eventWhere.orgId = orgId;
      }
      if (ctx.user.role === "ADMIN" && eventId) {
        eventWhere.id = eventId;
      }

      // Get event IDs matching org scope
      const events = await db.event.findMany({
        where: eventWhere,
        select: { id: true },
      });
      const eventIds = events.map(e => e.id);

      // Apply event filtering to tap logs
      const tapLogWhere: Prisma.TapLogWhereInput = {
        ...dateWhere,
        ...(eventIds.length > 0 && { eventId: { in: eventIds } }),
        ...(eventId && { eventId }),
      };

      // Execute 3 queries in parallel
      const [totalTaps, uniqueBandsResult, activeEventsResult] = await Promise.all([
        // Total taps in date range
        db.tapLog.count({ where: tapLogWhere }),

        // Unique bands (distinct bandId)
        db.tapLog.groupBy({
          by: ["bandId"],
          where: tapLogWhere,
        }),

        // Active events (events with at least 1 tap)
        db.tapLog.groupBy({
          by: ["eventId"],
          where: tapLogWhere,
        }),
      ]);

      const uniqueBands = uniqueBandsResult.length;

      // Calculate TPM (taps per minute)
      const minutesInRange = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 60000);
      const tpm = Math.round((totalTaps / minutesInRange) * 100) / 100;

      // Build event filter for raw SQL query
      const eventFilter = eventId
        ? Prisma.sql`AND "eventId" = ${eventId}`
        : eventIds.length > 0
        ? Prisma.sql`AND "eventId" IN (${Prisma.join(eventIds)})`
        : Prisma.sql`AND 1=1`;

      // Execute additional queries in parallel
      const [peakTpmResult, totalBands, modeDist] = await Promise.all([
        // Peak TPM: max taps in any single minute
        db.$queryRaw<Array<{ minute: Date; count: bigint }>>(Prisma.sql`
          SELECT DATE_TRUNC('minute', "tappedAt") as minute, COUNT(*)::int as count
          FROM "TapLog"
          WHERE "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}
            ${eventFilter}
          GROUP BY DATE_TRUNC('minute', "tappedAt")
          ORDER BY count DESC
          LIMIT 1
        `),

        // Total bands (for activity calculation)
        db.band.count({
          where: eventIds.length > 0
            ? { eventId: { in: eventIds } }
            : eventId
            ? { eventId }
            : {},
        }),

        // Mode distribution
        db.tapLog.groupBy({
          by: ["modeServed"],
          where: tapLogWhere,
          _count: true,
        }),
      ]);

      const peakTpm = peakTpmResult[0] ? Number(peakTpmResult[0].count) : 0;

      // Band activity %
      const bandActivityPercent = totalBands > 0
        ? Math.round((uniqueBands / totalBands) * 100)
        : 0;

      // Avg taps/band
      const avgTapsPerBand = uniqueBands > 0
        ? Math.round((totalTaps / uniqueBands) * 100) / 100
        : 0;

      // Mode distribution with all modes
      const modeDistribution: Record<string, number> = { PRE: 0, LIVE: 0, POST: 0 };
      modeDist.forEach(({ modeServed, _count }) => {
        modeDistribution[modeServed] = _count;
      });

      return {
        totalTaps,
        uniqueBands,
        activeEvents: activeEventsResult.length,
        tpm,
        peakTpm,
        bandActivityPercent,
        avgTapsPerBand,
        modeDistribution,
      };
    }),

  tapsByDay: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const { from, to, eventId, orgId } = input;

      // Build org-scoping for events
      let eventWhere: Prisma.EventWhereInput = {};
      if (ctx.user.role === "CUSTOMER") {
        eventWhere.orgId = ctx.user.orgId!;
      } else if (ctx.user.role === "ADMIN" && orgId) {
        eventWhere.orgId = orgId;
      }
      if (ctx.user.role === "ADMIN" && eventId) {
        eventWhere.id = eventId;
      }

      // Get event IDs matching org scope
      const events = await db.event.findMany({
        where: eventWhere,
        select: { id: true },
      });
      const eventIds = events.map(e => e.id);

      // Build event filter for raw query
      const eventFilter = eventId
        ? Prisma.sql`AND "eventId" = ${eventId}`
        : eventIds.length > 0
        ? Prisma.sql`AND "eventId" IN (${Prisma.join(eventIds)})`
        : Prisma.sql`AND 1=1`;

      // Use raw SQL for date bucketing with PostgreSQL DATE_TRUNC
      const results = await db.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        SELECT
          DATE_TRUNC('day', "tappedAt")::date as date,
          COUNT(*)::int as count
        FROM "TapLog"
        WHERE "tappedAt" >= ${new Date(from)}
          AND "tappedAt" <= ${new Date(to)}
          ${eventFilter}
        GROUP BY DATE_TRUNC('day', "tappedAt")
        ORDER BY date ASC
      `);

      // Convert to expected format
      return results.map((row) => ({
        date: row.date.toISOString().split('T')[0], // YYYY-MM-DD
        count: Number(row.count),
      }));
    }),

  topEvents: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const { from, to } = input;

      // Build org-scoping for events
      let eventWhere: Prisma.EventWhereInput = {};
      if (ctx.user.role === "CUSTOMER") {
        eventWhere.orgId = ctx.user.orgId!;
      }

      // Get event IDs matching org scope
      const events = await db.event.findMany({
        where: eventWhere,
        select: { id: true },
      });
      const eventIds = events.map(e => e.id);

      // Build event filter for raw query
      const eventFilter = eventIds.length > 0
        ? Prisma.sql`AND t."eventId" IN (${Prisma.join(eventIds)})`
        : Prisma.sql`AND 1=1`;

      // Use raw SQL to join TapLog with Event and group by event
      const results = await db.$queryRaw<Array<{ eventId: string; eventName: string; tapCount: bigint }>>(Prisma.sql`
        SELECT
          t."eventId",
          e."name" as "eventName",
          COUNT(*)::int as "tapCount"
        FROM "TapLog" t
        INNER JOIN "Event" e ON t."eventId" = e."id"
        WHERE t."tappedAt" >= ${new Date(from)}
          AND t."tappedAt" <= ${new Date(to)}
          ${eventFilter}
        GROUP BY t."eventId", e."name"
        ORDER BY "tapCount" DESC
        LIMIT 10
      `);

      // Convert to expected format
      return results.map((row) => ({
        eventId: row.eventId,
        eventName: row.eventName,
        tapCount: Number(row.tapCount),
      }));
    }),

  topOrgs: protectedProcedure
    .input(z.object({
      from: z.string().datetime({ offset: true }),
      to: z.string().datetime({ offset: true }),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { from, to } = input;
      const fromDate = new Date(from);
      const toDate = new Date(to);

      const results = await db.$queryRaw<
        Array<{ orgId: string; orgName: string; eventCount: bigint; tapCount: bigint }>
      >(Prisma.sql`
        SELECT
          o."id" as "orgId",
          o."name" as "orgName",
          COUNT(DISTINCT e."id")::int as "eventCount",
          COUNT(t."id")::int as "tapCount"
        FROM "Organization" o
        LEFT JOIN "Event" e ON e."orgId" = o."id"
        LEFT JOIN "TapLog" t ON t."eventId" = e."id"
          AND t."tappedAt" >= ${fromDate}
          AND t."tappedAt" <= ${toDate}
        GROUP BY o."id", o."name"
        ORDER BY "tapCount" DESC
        LIMIT 20
      `);

      const minutesInRange = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 60000);

      return results.map((row) => ({
        orgId: row.orgId,
        orgName: row.orgName,
        eventCount: Number(row.eventCount),
        tapCount: Number(row.tapCount),
        tpm: Math.round((Number(row.tapCount) / minutesInRange) * 100) / 100,
      }));
    }),
});
