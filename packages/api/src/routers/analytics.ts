import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getAnalytics } from "@sparkmotion/redis";
import { db } from "@sparkmotion/database";
import { Prisma } from "@sparkmotion/database";

// Shared input schema for date range queries
const dateRangeInput = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  eventId: z.string().optional(),
});

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

  kpis: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const { from, to, eventId } = input;

      // Build base where clause for date range
      const dateWhere: Prisma.TapLogWhereInput = {
        tappedAt: {
          gte: new Date(from),
          lte: new Date(to),
        },
      };

      // Apply org-scoping for CUSTOMER role
      let eventWhere: Prisma.EventWhereInput = {};
      if (ctx.user.role === "CUSTOMER") {
        eventWhere.orgId = ctx.user.orgId!;
      } else if (ctx.user.role === "ADMIN" && eventId) {
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

      return {
        totalTaps,
        uniqueBands: uniqueBandsResult.length,
        activeEvents: activeEventsResult.length,
      };
    }),

  tapsByDay: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const { from, to, eventId } = input;

      // Build org-scoping for events
      let eventWhere: Prisma.EventWhereInput = {};
      if (ctx.user.role === "CUSTOMER") {
        eventWhere.orgId = ctx.user.orgId!;
      } else if (ctx.user.role === "ADMIN" && eventId) {
        eventWhere.id = eventId;
      }

      // Get event IDs matching org scope
      const events = await db.event.findMany({
        where: eventWhere,
        select: { id: true },
      });
      const eventIds = events.map(e => e.id);

      // Build where clause for raw query
      const eventFilter = eventIds.length > 0
        ? Prisma.sql`AND "eventId" = ANY(${eventIds}::text[])`
        : Prisma.empty;

      const specificEventFilter = eventId
        ? Prisma.sql`AND "eventId" = ${eventId}`
        : Prisma.empty;

      // Use raw SQL for date bucketing with PostgreSQL DATE_TRUNC
      const results = await db.$queryRaw<Array<{ date: Date; count: bigint }>>`
        SELECT
          DATE_TRUNC('day', "tappedAt")::date as date,
          COUNT(*)::int as count
        FROM "TapLog"
        WHERE "tappedAt" >= ${new Date(from)}
          AND "tappedAt" <= ${new Date(to)}
          ${eventFilter}
          ${specificEventFilter}
        GROUP BY DATE_TRUNC('day', "tappedAt")
        ORDER BY date ASC
      `;

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

      // Build where clause for raw query
      const eventFilter = eventIds.length > 0
        ? Prisma.sql`AND t."eventId" = ANY(${eventIds}::text[])`
        : Prisma.empty;

      // Use raw SQL to join TapLog with Event and group by event
      const results = await db.$queryRaw<Array<{ eventId: string; eventName: string; tapCount: bigint }>>`
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
      `;

      // Convert to expected format
      return results.map((row) => ({
        eventId: row.eventId,
        eventName: row.eventName,
        tapCount: Number(row.tapCount),
      }));
    }),
});
