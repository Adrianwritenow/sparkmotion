import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getVelocityHistory, getAnalytics, getHourlyAnalytics } from "@sparkmotion/redis";
import { db } from "@sparkmotion/database";
import { Prisma } from "@sparkmotion/database";
import { TRPCError } from "@trpc/server";
import { getEventEngagement, aggregateCampaignEngagement } from "../lib/engagement";

// Shared input schema for date range queries
const dateRangeInput = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  eventId: z.string().optional(),
  orgId: z.string().optional(),
});

// Shared input schemas for event/campaign analytics filters
const eventAnalyticsFilterInput = z.object({
  eventId: z.string(),
  windowId: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const campaignAnalyticsFilterInput = z.object({
  campaignId: z.string(),
  eventId: z.string().optional(),
  windowId: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

/** Resolves windowId + from/to into SQL filter fragments. */
function buildDateFilter(params: {
  windowId?: string;
  from?: string;
  to?: string;
}): { dateFilter: Prisma.Sql; windowFilter: Prisma.Sql; fromDate?: Date; toDate?: Date } {
  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  // Direct windowId filter — uses @@index([eventId, windowId]) on TapLog
  const windowFilter = params.windowId
    ? Prisma.sql`AND "windowId" = ${params.windowId}`
    : Prisma.sql``;

  // Explicit from/to date bounds
  if (params.from) {
    fromDate = new Date(params.from);
  }
  if (params.to) {
    toDate = new Date(params.to);
  }

  if (fromDate && toDate) {
    return {
      dateFilter: Prisma.sql`AND "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}`,
      windowFilter,
      fromDate,
      toDate,
    };
  }
  if (fromDate) {
    return {
      dateFilter: Prisma.sql`AND "tappedAt" >= ${fromDate}`,
      windowFilter,
      fromDate,
    };
  }
  if (toDate) {
    return {
      dateFilter: Prisma.sql`AND "tappedAt" <= ${toDate}`,
      windowFilter,
      toDate,
    };
  }

  return { dateFilter: Prisma.sql``, windowFilter };
}

export const analyticsRouter = router({
  live: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: input.eventId, deletedAt: null },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const [analytics, activeWindows] = await Promise.all([
        getAnalytics(input.eventId),
        db.eventWindow.findMany({
          where: { eventId: input.eventId, isActive: true },
          select: { windowType: true },
        }),
      ]);

      let mode: "pre" | "live" | "post" = "pre";
      if (activeWindows.length > 0) {
        if (activeWindows.some((w) => w.windowType === "LIVE")) mode = "live";
        else if (activeWindows.some((w) => w.windowType === "POST")) mode = "post";
      }

      return {
        totalTaps: analytics.totalTaps,
        uniqueTaps: analytics.uniqueTaps,
        mode,
      };
    }),

  velocityHistory: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: input.eventId, deletedAt: null },
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
    .input(eventAnalyticsFilterInput)
    .query(async ({ input }) => {
      const { dateFilter, windowFilter } = buildDateFilter(input);
      const hasFilters = !!(input.windowId || input.from || input.to);
      const [tapCounts, totalBandCount] = await Promise.all([
        db.$queryRaw<[{ total_taps: bigint; unique_bands: bigint }]>(Prisma.sql`
          SELECT
            COUNT(*)::int AS total_taps,
            COUNT(DISTINCT "bandId")::int AS unique_bands
          FROM "TapLog"
          WHERE "eventId" = ${input.eventId}
            ${dateFilter}
            ${windowFilter}
        `),
        db.band.count({ where: { eventId: input.eventId, deletedAt: null } }),
      ]);
      const uniqueBands = Number(tapCounts[0]?.unique_bands ?? 0);

      let engagementPercent: number;
      let bandCount: number;
      if (hasFilters) {
        // When filtered, use unique bands from filtered query as the band count
        // and derive engagement inline instead of querying all TapLog rows
        bandCount = uniqueBands;
        engagementPercent = totalBandCount > 0
          ? Math.round((uniqueBands / totalBandCount) * 10000) / 100
          : 0;
      } else {
        bandCount = totalBandCount;
        const bandCountMap = new Map([[input.eventId, totalBandCount]]);
        const engagementMap = await getEventEngagement([input.eventId], bandCountMap);
        engagementPercent = engagementMap.get(input.eventId)?.engagementPercent ?? 0;
      }

      return {
        bandCount,
        tapCount: Number(tapCounts[0]?.total_taps ?? 0),
        uniqueBands,
        engagementPercent,
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
          db.band.count({ where: { eventId, deletedAt: null } }),
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
          postEventTaps: byMode.post,
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
        where: { ...eventWhere, deletedAt: null },
        select: { id: true },
      });
      const eventIds = events.map(e => e.id);

      // Apply event filtering to tap logs
      const tapLogWhere: Prisma.TapLogWhereInput = {
        ...dateWhere,
        ...(eventIds.length > 0 && { eventId: { in: eventIds } }),
        ...(eventId && { eventId }),
      };

      // Build event filter for distinct counts query
      const distinctEventFilter = eventId
        ? Prisma.sql`AND "eventId" = ${eventId}`
        : eventIds.length > 0
        ? Prisma.sql`AND "eventId" IN (${Prisma.join(eventIds)})`
        : Prisma.sql``;

      // Execute queries in parallel — use COUNT(DISTINCT) instead of groupBy
      const [totalTaps, distinctCounts] = await Promise.all([
        // Total taps in date range
        db.tapLog.count({ where: tapLogWhere }),

        // Unique bands + active events in a single query
        db.$queryRaw<[{ unique_bands: bigint; active_events: bigint }]>(Prisma.sql`
          SELECT
            COUNT(DISTINCT "bandId")::int AS unique_bands,
            COUNT(DISTINCT "eventId")::int AS active_events
          FROM "TapLog"
          WHERE "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}
            ${distinctEventFilter}
        `),
      ]);

      const uniqueBands = Number(distinctCounts[0]?.unique_bands ?? 0);

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
            ? { eventId: { in: eventIds }, deletedAt: null }
            : eventId
            ? { eventId, deletedAt: null }
            : { deletedAt: null },
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
        activeEvents: Number(distinctCounts[0]?.active_events ?? 0),
        tpm,
        peakTpm,
        bandActivityPercent,
        avgTapsPerBand,
        postEventTaps: modeDistribution.POST ?? 0,
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
        where: { ...eventWhere, deletedAt: null },
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
      } else if (ctx.user.role === "ADMIN" && input.orgId) {
        eventWhere.orgId = input.orgId;
      }

      // Get event IDs matching org scope
      const events = await db.event.findMany({
        where: { ...eventWhere, deletedAt: null },
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

  engagementByHour: protectedProcedure
    .input(eventAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { eventId } = input;

      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: eventId, deletedAt: null },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const { dateFilter, windowFilter, fromDate, toDate } = buildDateFilter(input);

      const seriesStart = fromDate
        ? Prisma.sql`${fromDate}::date`
        : Prisma.sql`DATE_TRUNC('day', (SELECT MIN("tappedAt") FROM "TapLog" WHERE "eventId" = ${eventId}))::date`;
      const seriesEnd = toDate
        ? Prisma.sql`${toDate}::date`
        : Prisma.sql`CURRENT_DATE`;

      const results = await db.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          SELECT generate_series(
            ${seriesStart},
            ${seriesEnd},
            '1 day'::interval
          )::date AS date
        ),
        daily_counts AS (
          SELECT
            DATE_TRUNC('day', "tappedAt")::date AS date,
            COUNT(*)::int AS count
          FROM "TapLog"
          WHERE "eventId" = ${eventId}
            ${dateFilter}
            ${windowFilter}
          GROUP BY DATE_TRUNC('day', "tappedAt")
        )
        SELECT
          ds.date,
          COALESCE(dc.count, 0)::int AS count
        FROM date_series ds
        LEFT JOIN daily_counts dc ON ds.date = dc.date
        ORDER BY ds.date ASC
      `);

      return results.map((row) => ({
        date: row.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        interactions: Number(row.count),
      }));
    }),

  registrationGrowth: protectedProcedure
    .input(eventAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { eventId } = input;

      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: eventId, deletedAt: null },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const { dateFilter, windowFilter, fromDate, toDate } = buildDateFilter(input);

      // Bound generate_series with filter dates when available
      const seriesStart = fromDate
        ? Prisma.sql`${fromDate}::date`
        : Prisma.sql`DATE_TRUNC('day', (SELECT "createdAt" FROM "Event" WHERE "id" = ${eventId}))::date`;
      const seriesEnd = toDate
        ? Prisma.sql`${toDate}::date`
        : Prisma.sql`CURRENT_DATE`;

      const results = await db.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          SELECT generate_series(
            ${seriesStart},
            ${seriesEnd},
            '1 day'::interval
          )::date AS date
        ),
        daily_counts AS (
          SELECT
            DATE_TRUNC('day', "tappedAt")::date AS date,
            COUNT(*)::int AS count
          FROM "TapLog"
          WHERE "eventId" = ${eventId}
            ${dateFilter}
            ${windowFilter}
          GROUP BY DATE_TRUNC('day', "tappedAt")
        )
        SELECT
          ds.date,
          COALESCE(dc.count, 0)::int AS count
        FROM date_series ds
        LEFT JOIN daily_counts dc ON ds.date = dc.date
        ORDER BY ds.date ASC
      `);

      return results.map((row) => ({
        date: row.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: Number(row.count),
      }));
    }),

  campaignEngagementByHour: protectedProcedure
    .input(campaignAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { campaignId, eventId } = input;

      // Get campaign's ACTIVE/COMPLETED events (with org-scoping)
      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: campaignId, deletedAt: null },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, deletedAt: null },
            select: { id: true },
          },
        },
      });

      if (ctx.user.role === "CUSTOMER" && campaign.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const eventIds = eventId
        ? [eventId]
        : campaign.events.map((e) => e.id);

      if (eventIds.length === 0) {
        return [];
      }

      const { dateFilter, windowFilter, fromDate, toDate } = buildDateFilter(input);

      const eventFilter = eventIds.length === 1
        ? Prisma.sql`"eventId" = ${eventIds[0]}`
        : Prisma.sql`"eventId" IN (${Prisma.join(eventIds)})`;

      const seriesStart = fromDate
        ? Prisma.sql`${fromDate}::date`
        : Prisma.sql`DATE_TRUNC('day', (SELECT MIN("tappedAt") FROM "TapLog" WHERE ${eventFilter}))::date`;
      const seriesEnd = toDate
        ? Prisma.sql`${toDate}::date`
        : Prisma.sql`CURRENT_DATE`;

      const results = await db.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          SELECT generate_series(
            ${seriesStart},
            ${seriesEnd},
            '1 day'::interval
          )::date AS date
        ),
        daily_counts AS (
          SELECT
            DATE_TRUNC('day', "tappedAt")::date AS date,
            COUNT(*)::int AS count
          FROM "TapLog"
          WHERE ${eventFilter}
            ${dateFilter}
            ${windowFilter}
          GROUP BY DATE_TRUNC('day', "tappedAt")
        )
        SELECT
          ds.date,
          COALESCE(dc.count, 0)::int AS count
        FROM date_series ds
        LEFT JOIN daily_counts dc ON ds.date = dc.date
        ORDER BY ds.date ASC
      `);

      return results.map((row) => ({
        date: row.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        interactions: Number(row.count),
      }));
    }),

  campaignRegistrationGrowth: protectedProcedure
    .input(campaignAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { campaignId, eventId } = input;

      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: campaignId, deletedAt: null },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, deletedAt: null },
            select: { id: true },
          },
        },
      });

      if (ctx.user.role === "CUSTOMER" && campaign.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const eventIds = eventId
        ? [eventId]
        : campaign.events.map((e) => e.id);

      if (eventIds.length === 0) {
        return [];
      }

      const { dateFilter, windowFilter, fromDate, toDate } = buildDateFilter(input);

      const eventFilter = eventIds.length === 1
        ? Prisma.sql`"eventId" = ${eventIds[0]}`
        : Prisma.sql`"eventId" IN (${Prisma.join(eventIds)})`;

      const eventIdFilter = eventIds.length === 1
        ? Prisma.sql`"id" = ${eventIds[0]}`
        : Prisma.sql`"id" IN (${Prisma.join(eventIds)})`;

      const seriesStart = fromDate
        ? Prisma.sql`${fromDate}::date`
        : Prisma.sql`(SELECT MIN("createdAt")::date FROM "Event" WHERE ${eventIdFilter})::date`;
      const seriesEnd = toDate
        ? Prisma.sql`${toDate}::date`
        : Prisma.sql`CURRENT_DATE`;

      const results = await db.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          SELECT generate_series(
            ${seriesStart},
            ${seriesEnd},
            '1 day'::interval
          )::date AS date
        ),
        daily_counts AS (
          SELECT
            DATE_TRUNC('day', "tappedAt")::date AS date,
            COUNT(*)::int AS count
          FROM "TapLog"
          WHERE ${eventFilter}
            ${dateFilter}
            ${windowFilter}
          GROUP BY DATE_TRUNC('day', "tappedAt")
        )
        SELECT
          ds.date,
          COALESCE(dc.count, 0)::int AS count
        FROM date_series ds
        LEFT JOIN daily_counts dc ON ds.date = dc.date
        ORDER BY ds.date ASC
      `);

      return results.map((row) => ({
        date: row.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        count: Number(row.count),
      }));
    }),

  campaignSummary: protectedProcedure
    .input(campaignAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { campaignId, eventId } = input;

      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: campaignId, deletedAt: null },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, deletedAt: null },
            select: { id: true, name: true, location: true, _count: { select: { bands: { where: { deletedAt: null } } } } },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (ctx.user.role === "CUSTOMER" && campaign.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const eventIds = eventId
        ? [eventId]
        : campaign.events.map((e) => e.id);

      if (eventIds.length === 0) {
        return { eventCount: 0, bandCount: 0, tapCount: 0, uniqueBands: 0, breakdown: [] };
      }

      const { dateFilter, windowFilter } = buildDateFilter(input);
      const hasFilters = !!(input.windowId || input.from || input.to);

      const [tapCounts, totalBandCount, perEvent] = await Promise.all([
        db.$queryRaw<[{ total_taps: bigint; unique_bands: bigint }]>(Prisma.sql`
          SELECT
            COUNT(*)::int AS total_taps,
            COUNT(DISTINCT "bandId")::int AS unique_bands
          FROM "TapLog"
          WHERE "eventId" IN (${Prisma.join(eventIds)})
            ${dateFilter}
            ${windowFilter}
        `),
        db.band.count({ where: { eventId: { in: eventIds }, deletedAt: null } }),
        db.$queryRaw<Array<{ eventId: string; total_taps: bigint; unique_bands: bigint }>>(Prisma.sql`
          SELECT
            "eventId",
            COUNT(*)::int AS total_taps,
            COUNT(DISTINCT "bandId")::int AS unique_bands
          FROM "TapLog"
          WHERE "eventId" IN (${Prisma.join(eventIds)})
            ${dateFilter}
            ${windowFilter}
          GROUP BY "eventId"
        `),
      ]);

      const perEventMap = new Map(perEvent.map((r) => [r.eventId, r]));
      const filteredEvents = campaign.events.filter((e) => eventIds.includes(e.id));
      const uniqueBands = Number(tapCounts[0]?.unique_bands ?? 0);

      let aggregateEngagement: number;
      let bandCount: number;
      let breakdown: Array<{
        eventId: string;
        name: string;
        location: string | null;
        bandCount: number;
        tapCount: number;
        engagementPercent: number;
      }>;

      if (hasFilters) {
        // When filtered, use unique bands from filtered query as the band count
        // and derive engagement inline instead of querying all TapLog rows
        bandCount = uniqueBands;
        aggregateEngagement = totalBandCount > 0
          ? Math.round((uniqueBands / totalBandCount) * 10000) / 100
          : 0;
        breakdown = filteredEvents.map((e) => {
          const stats = perEventMap.get(e.id);
          const tapCount = Number(stats?.total_taps ?? 0);
          const eventUniqueBands = Number(stats?.unique_bands ?? 0);
          const eventTotalBands = e._count.bands;
          const engagementPercent = eventTotalBands > 0
            ? Math.round((eventUniqueBands / eventTotalBands) * 10000) / 100
            : 0;
          return {
            eventId: e.id,
            name: e.name,
            location: e.location,
            bandCount: eventUniqueBands,
            tapCount,
            engagementPercent,
          };
        });
      } else {
        bandCount = totalBandCount;
        const bandCountByEvent = new Map(
          filteredEvents.map((e) => [e.id, e._count.bands] as const)
        );
        const engagementMap = await getEventEngagement(eventIds, bandCountByEvent);
        const result = aggregateCampaignEngagement(filteredEvents, engagementMap);
        aggregateEngagement = result.aggregateEngagement;
        breakdown = filteredEvents.map((e) => {
          const stats = perEventMap.get(e.id);
          const tapCount = Number(stats?.total_taps ?? 0);
          const engagementPercent = engagementMap.get(e.id)?.engagementPercent ?? 0;
          return {
            eventId: e.id,
            name: e.name,
            location: e.location,
            bandCount: e._count.bands,
            tapCount,
            engagementPercent,
          };
        });
      }

      return {
        eventCount: eventId ? 1 : campaign.events.length,
        bandCount,
        tapCount: Number(tapCounts[0]?.total_taps ?? 0),
        uniqueBands,
        aggregateEngagement,
        breakdown,
      };
    }),

  tapsByWindow: protectedProcedure
    .input(z.object({
      eventId: z.string(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { eventId } = input;

      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: eventId, deletedAt: null },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      // Fetch all windows for this event
      const windows = await db.eventWindow.findMany({
        where: { eventId },
        select: { id: true, windowType: true, title: true, url: true, startTime: true, endTime: true },
        orderBy: { createdAt: "asc" },
      });

      if (windows.length === 0) return [];

      // Build date bounds
      const fromDate = input.from ? new Date(input.from) : undefined;
      const toDate = input.to ? new Date(input.to) : undefined;

      // Separate windows with/without time ranges
      const windowCases = windows
        .filter((w) => w.startTime && w.endTime)
        .map((w) => ({
          id: w.id,
          windowType: w.windowType,
          title: w.title,
          url: w.url,
          start: w.startTime!,
          end: w.endTime!,
        }));

      if (windowCases.length === 0) {
        // Windows exist but lack time ranges — fall back to counting by windowId
        const fallbackResults = await Promise.all(
          windows.map(async (w) => {
            const dateFilter = fromDate && toDate
              ? Prisma.sql`AND "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}`
              : Prisma.sql``;
            const [row] = await db.$queryRaw<[{ count: bigint }]>(Prisma.sql`
              SELECT COUNT(*)::int AS count
              FROM "TapLog"
              WHERE "eventId" = ${eventId}
                AND "windowId" = ${w.id}
                ${dateFilter}
            `);
            return {
              windowId: w.id,
              windowType: w.windowType,
              title: w.title,
              url: w.url,
              count: Number(row?.count ?? 0),
            };
          })
        );
        return fallbackResults;
      }

      // Count taps per window using windowId (indexed) with optional date filter
      const results = await Promise.all(
        windowCases.map(async (w) => {
          const dateFilter = fromDate && toDate
            ? Prisma.sql`AND "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}`
            : Prisma.sql``;

          const [row] = await db.$queryRaw<[{ count: bigint }]>(Prisma.sql`
            SELECT COUNT(*)::int AS count
            FROM "TapLog"
            WHERE "eventId" = ${eventId}
              AND "windowId" = ${w.id}
              ${dateFilter}
          `);

          return {
            windowId: w.id,
            windowType: w.windowType,
            title: w.title,
            url: w.url,
            count: Number(row?.count ?? 0),
          };
        })
      );

      return results;
    }),

  tapsByWindowType: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      eventId: z.string().optional(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { campaignId, eventId } = input;

      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: campaignId, deletedAt: null },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, deletedAt: null },
            select: { id: true },
          },
        },
      });

      if (ctx.user.role === "CUSTOMER" && campaign.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const eventIds = eventId
        ? [eventId]
        : campaign.events.map((e) => e.id);

      if (eventIds.length === 0) {
        return [];
      }

      const fromDate = input.from ? new Date(input.from) : undefined;
      const toDate = input.to ? new Date(input.to) : undefined;

      const dateFilter = fromDate && toDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate} AND tl."tappedAt" <= ${toDate}`
        : fromDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate}`
        : toDate
        ? Prisma.sql`AND tl."tappedAt" <= ${toDate}`
        : Prisma.sql``;

      const eventFilter = eventIds.length === 1
        ? Prisma.sql`tl."eventId" = ${eventIds[0]}`
        : Prisma.sql`tl."eventId" IN (${Prisma.join(eventIds)})`;

      const results = await db.$queryRaw<Array<{ type: string; count: number }>>(Prisma.sql`
        SELECT
          ew."windowType" AS type,
          COUNT(*)::int AS count
        FROM "TapLog" tl
        JOIN "EventWindow" ew ON tl."windowId" = ew."id"
        WHERE ${eventFilter}
          ${dateFilter}
        GROUP BY ew."windowType"
        ORDER BY count DESC
      `);

      return results;
    }),

  tapsByRedirectType: protectedProcedure
    .input(z.object({
      eventId: z.string(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { eventId } = input;

      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: eventId, deletedAt: null },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const fromDate = input.from ? new Date(input.from) : undefined;
      const toDate = input.to ? new Date(input.to) : undefined;

      const dateFilter = fromDate && toDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate} AND tl."tappedAt" <= ${toDate}`
        : fromDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate}`
        : toDate
        ? Prisma.sql`AND tl."tappedAt" <= ${toDate}`
        : Prisma.sql``;

      const results = await db.$queryRaw<Array<{ category: string; count: number }>>(Prisma.sql`
        SELECT
          CASE
            WHEN tl."windowId" IS NOT NULL THEN ew."windowType"::text
            WHEN e."fallbackUrl" IS NOT NULL AND tl."redirectUrl" = e."fallbackUrl" THEN 'FALLBACK'
            WHEN o."websiteUrl" IS NOT NULL AND tl."redirectUrl" = o."websiteUrl" THEN 'ORG'
            ELSE 'DEFAULT'
          END AS category,
          COUNT(*)::int AS count
        FROM "TapLog" tl
        INNER JOIN "Event" e ON tl."eventId" = e."id"
        INNER JOIN "Organization" o ON e."orgId" = o."id"
        LEFT JOIN "EventWindow" ew ON tl."windowId" = ew."id"
        WHERE tl."eventId" = ${eventId}
          ${dateFilter}
        GROUP BY category
        ORDER BY count DESC
      `);

      return results;
    }),

  campaignTapsByRedirectType: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      eventId: z.string().optional(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { campaignId, eventId } = input;

      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: campaignId, deletedAt: null },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, deletedAt: null },
            select: { id: true },
          },
        },
      });

      if (ctx.user.role === "CUSTOMER" && campaign.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const eventIds = eventId
        ? [eventId]
        : campaign.events.map((e) => e.id);

      if (eventIds.length === 0) {
        return [];
      }

      const fromDate = input.from ? new Date(input.from) : undefined;
      const toDate = input.to ? new Date(input.to) : undefined;

      const dateFilter = fromDate && toDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate} AND tl."tappedAt" <= ${toDate}`
        : fromDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate}`
        : toDate
        ? Prisma.sql`AND tl."tappedAt" <= ${toDate}`
        : Prisma.sql``;

      const eventFilter = eventIds.length === 1
        ? Prisma.sql`tl."eventId" = ${eventIds[0]}`
        : Prisma.sql`tl."eventId" IN (${Prisma.join(eventIds)})`;

      const results = await db.$queryRaw<Array<{ category: string; count: number }>>(Prisma.sql`
        SELECT
          CASE
            WHEN tl."windowId" IS NOT NULL THEN ew."windowType"::text
            WHEN e."fallbackUrl" IS NOT NULL AND tl."redirectUrl" = e."fallbackUrl" THEN 'FALLBACK'
            WHEN o."websiteUrl" IS NOT NULL AND tl."redirectUrl" = o."websiteUrl" THEN 'ORG'
            ELSE 'DEFAULT'
          END AS category,
          COUNT(*)::int AS count
        FROM "TapLog" tl
        INNER JOIN "Event" e ON tl."eventId" = e."id"
        INNER JOIN "Organization" o ON e."orgId" = o."id"
        LEFT JOIN "EventWindow" ew ON tl."windowId" = ew."id"
        WHERE ${eventFilter}
          ${dateFilter}
        GROUP BY category
        ORDER BY count DESC
      `);

      return results;
    }),

  cohortRetention: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { eventId } = input;

      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({ where: { id: eventId, deletedAt: null }, select: { orgId: true } });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      // For each band, compute days between firstTapAt and subsequent taps
      // Return percentage of bands that returned at Day 1, 3, 7, 14, 30
      const results = await db.$queryRaw<Array<{ day_bucket: number; band_count: bigint }>>(Prisma.sql`
        WITH band_first AS (
          SELECT b."id" AS band_id, b."firstTapAt" AS first_tap
          FROM "Band" b
          WHERE b."eventId" = ${eventId} AND b."firstTapAt" IS NOT NULL
        ),
        return_days AS (
          SELECT
            bf.band_id,
            EXTRACT(DAY FROM (t."tappedAt" - bf.first_tap))::int AS days_since
          FROM "TapLog" t
          INNER JOIN band_first bf ON t."bandId" = bf.band_id
          WHERE t."eventId" = ${eventId}
            AND t."tappedAt" > bf.first_tap
        )
        SELECT
          d.day AS day_bucket,
          COUNT(DISTINCT rd.band_id)::int AS band_count
        FROM (VALUES (1), (3), (7), (14), (30)) AS d(day)
        LEFT JOIN return_days rd ON rd.days_since >= d.day
        GROUP BY d.day
        ORDER BY d.day
      `);

      // Get total bands with first tap
      const totalBands = await db.band.count({
        where: { eventId, firstTapAt: { not: null }, deletedAt: null },
      });

      const retention: Record<string, number> = {};
      for (const r of results) {
        const pct = totalBands > 0
          ? Math.round((Number(r.band_count) / totalBands) * 1000) / 10
          : 0;
        retention[`day${r.day_bucket}`] = pct;
      }

      return {
        totalBands,
        day1: retention.day1 ?? 0,
        day3: retention.day3 ?? 0,
        day7: retention.day7 ?? 0,
        day14: retention.day14 ?? 0,
        day30: retention.day30 ?? 0,
      };
    }),

  exportTaps: protectedProcedure
    .input(z.object({
      from: z.string().datetime({ offset: true }),
      to: z.string().datetime({ offset: true }),
      eventId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { from, to, eventId } = input;
      const fromDate = new Date(from);
      const toDate = new Date(to);

      // Build where clause with org-scoping
      const where: Prisma.TapLogWhereInput = {
        tappedAt: { gte: fromDate, lte: toDate },
      };

      if (eventId) {
        where.eventId = eventId;
      }

      if (ctx.user.role === "CUSTOMER") {
        const events = await db.event.findMany({
          where: { orgId: ctx.user.orgId!, deletedAt: null },
          select: { id: true },
        });
        where.eventId = { in: events.map(e => e.id) };
      }

      const taps = await db.tapLog.findMany({
        where,
        include: {
          band: { select: { bandId: true } },
          event: { select: { name: true, city: true, state: true } },
        },
        orderBy: { tappedAt: "desc" },
        take: 50000,
      });

      return taps.map(t => ({
        bandId: t.band.bandId,
        eventName: t.event.name,
        eventCity: t.event.city,
        eventState: t.event.state,
        tappedAt: t.tappedAt.toISOString(),
        modeServed: t.modeServed,
        redirectUrl: t.redirectUrl,
        ipAddress: t.ipAddress,
        userAgent: t.userAgent,
      }));
    }),

  compareEvents: protectedProcedure
    .input(z.object({
      eventIds: z.array(z.string()).min(2).max(5),
      from: z.string().datetime({ offset: true }),
      to: z.string().datetime({ offset: true }),
    }))
    .query(async ({ ctx, input }) => {
      const { eventIds, from, to } = input;
      const fromDate = new Date(from);
      const toDate = new Date(to);

      // Org-scoping: verify CUSTOMER has access to all requested events
      if (ctx.user.role === "CUSTOMER") {
        const accessibleEvents = await db.event.findMany({
          where: { id: { in: eventIds }, orgId: ctx.user.orgId!, deletedAt: null },
          select: { id: true },
        });
        if (accessibleEvents.length !== eventIds.length) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const results = await db.$queryRaw<Array<{
        eventId: string;
        eventName: string;
        city: string | null;
        totalTaps: bigint;
        uniqueBands: bigint;
        peakTpm: bigint;
        postEventTaps: bigint;
      }>>(Prisma.sql`
        SELECT
          e."id" AS "eventId",
          e."name" AS "eventName",
          e."city",
          COUNT(t."id")::int AS "totalTaps",
          COUNT(DISTINCT t."bandId")::int AS "uniqueBands",
          COALESCE((
            SELECT MAX(sub.cnt)
            FROM (
              SELECT COUNT(*)::int AS cnt
              FROM "TapLog"
              WHERE "eventId" = e."id"
                AND "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}
              GROUP BY DATE_TRUNC('minute', "tappedAt")
            ) sub
          ), 0)::int AS "peakTpm",
          COUNT(CASE WHEN t."modeServed" = 'POST' THEN 1 END)::int AS "postEventTaps"
        FROM "Event" e
        LEFT JOIN "TapLog" t ON t."eventId" = e."id"
          AND t."tappedAt" >= ${fromDate} AND t."tappedAt" <= ${toDate}
        WHERE e."id" IN (${Prisma.join(eventIds)})
        GROUP BY e."id", e."name", e."city"
      `);

      return results.map(r => ({
        eventId: r.eventId,
        eventName: r.eventName,
        city: r.city,
        totalTaps: Number(r.totalTaps),
        uniqueBands: Number(r.uniqueBands),
        peakTpm: Number(r.peakTpm),
        postEventTaps: Number(r.postEventTaps),
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
