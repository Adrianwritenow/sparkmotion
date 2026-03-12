import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { getVelocityHistory, getAnalytics, getHourlyAnalytics } from "@sparkmotion/redis";
import { db } from "@sparkmotion/database";
import { Prisma } from "@sparkmotion/database";
import { TRPCError } from "@trpc/server";
import { getEventEngagement, aggregateCampaignEngagement } from "../lib/engagement";
import { enforceOrgAccess, getOrgFilter } from "../lib/auth";
import { ACTIVE } from "../lib/soft-delete";

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
  timezone: z.string().optional(),
});

async function getEventTimezone(eventId: string): Promise<string> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  return event?.timezone ?? "UTC";
}

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

/** True when both dates exist and span < 24 hours. */
function isSubDayRange(from?: Date, to?: Date): boolean {
  if (!from || !to) return false;
  return to.getTime() - from.getTime() < 24 * 60 * 60 * 1000;
}

/** "2 PM" for hourly, "Feb 24" for daily. */
function formatBucketLabel(date: Date, hourly: boolean): string {
  return hourly
    ? date.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// ── Multi-granularity helpers (campaign-level) ──

type Granularity = "yearly" | "monthly" | "weekly" | "daily" | "hourly" | "minute";

function detectGranularity(from?: Date, to?: Date): Granularity {
  if (!from || !to) return "daily";
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 60 * 60 * 1000) return "minute";           // <1h
  if (diffMs < 24 * 60 * 60 * 1000) return "hourly";      // <1d
  if (diffMs < 90 * 24 * 60 * 60 * 1000) return "daily";  // <90d
  if (diffMs < 180 * 24 * 60 * 60 * 1000) return "weekly"; // <6m
  if (diffMs < 2 * 365 * 24 * 60 * 60 * 1000) return "monthly"; // <2y
  return "yearly";
}

function granularityUnit(g: Granularity) {
  return { yearly: "year", monthly: "month", weekly: "week", daily: "day", hourly: "hour", minute: "minute" }[g];
}

function granularityInterval(g: Granularity) {
  return { yearly: "1 year", monthly: "1 month", weekly: "1 week", daily: "1 day", hourly: "1 hour", minute: "1 minute" }[g];
}

function formatGranularLabel(date: Date, g: Granularity): string {
  switch (g) {
    case "yearly":
      return date.toLocaleDateString("en-US", { year: "numeric", timeZone: "UTC" });
    case "monthly":
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    case "weekly":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    case "daily":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    case "hourly":
      return date.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" });
    case "minute":
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  }
}

function getBucketEnd(date: Date, g: Granularity): Date {
  const d = new Date(date);
  switch (g) {
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "daily": d.setDate(d.getDate() + 1); break;
    case "hourly": d.setHours(d.getHours() + 1); break;
    case "minute": d.setMinutes(d.getMinutes() + 1); break;
  }
  d.setMilliseconds(d.getMilliseconds() - 1);
  return d;
}

/**
 * PostgreSQL `AT TIME ZONE` returns timestamp without timezone, which Prisma
 * reads as UTC. This reverses that to produce a correct UTC ISO string.
 *
 * Example: 3 PM CDT is stored as Date("2026-03-12T15:00:00Z") (fake UTC).
 * This function returns "2026-03-12T20:00:00.000Z" (real UTC).
 */
function localToUtcIso(fakeUtcDate: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(fakeUtcDate);
  const g = (type: string) => parts.find((p) => p.type === type)!.value;
  const h = +g("hour") === 24 ? 0 : +g("hour");
  const localMs = Date.UTC(+g("year"), +g("month") - 1, +g("day"), h, +g("minute"), +g("second"));
  // Intl doesn't format ms — preserve from original to avoid offset drift
  const ms = fakeUtcDate.getTime() % 1000;
  const offsetMs = fakeUtcDate.getTime() - (localMs + ms);
  return new Date(fakeUtcDate.getTime() + offsetMs).toISOString();
}

/**
 * Convert a UTC timestamp column to a given timezone before truncating.
 * When `tz` is provided, uses a parameterized timezone string.
 * When omitted, references e."timezone" from the query's Event join.
 */
function tzExpr(col: string, tz?: string): Prisma.Sql {
  if (tz) {
    return Prisma.sql`${Prisma.raw(col)} AT TIME ZONE 'UTC' AT TIME ZONE ${tz}`;
  }
  return Prisma.raw(`${col} AT TIME ZONE 'UTC' AT TIME ZONE e."timezone"`);
}

/** Build series start/end + truncation SQL based on granularity.
 *  When `tz` is provided, series boundaries are converted to that timezone. */
function buildSeriesSql(g: Granularity, fromDate: Date | undefined, toDate: Date | undefined, eventFilter: Prisma.Sql, tz?: string) {
  const unit = granularityUnit(g);
  const interval = granularityInterval(g);
  const isSubDay = g === "hourly" || g === "minute";
  const dateCast = isSubDay ? Prisma.sql`` : Prisma.raw("::date");

  const truncUnit = Prisma.raw(`'${unit}'`);
  const intervalSql = Prisma.raw(`'${interval}'::interval`);

  let seriesStart: Prisma.Sql;
  let seriesEnd: Prisma.Sql;

  if (tz) {
    seriesStart = fromDate
      ? Prisma.sql`DATE_TRUNC(${truncUnit}, ${fromDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
      : Prisma.sql`DATE_TRUNC(${truncUnit}, (SELECT MIN("tappedAt") FROM "TapLog" tl WHERE ${eventFilter}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;
    seriesEnd = toDate
      ? Prisma.sql`(${toDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
      : isSubDay
        ? Prisma.sql`(NOW() AT TIME ZONE ${tz})`
        : Prisma.sql`(NOW() AT TIME ZONE ${tz})::date`;
  } else {
    seriesStart = fromDate
      ? Prisma.sql`DATE_TRUNC(${truncUnit}, ${fromDate}::timestamptz)${dateCast}`
      : Prisma.sql`DATE_TRUNC(${truncUnit}, (SELECT MIN("tappedAt") FROM "TapLog" tl WHERE ${eventFilter}))${dateCast}`;
    seriesEnd = toDate
      ? isSubDay
        ? Prisma.sql`${toDate}::timestamptz`
        : Prisma.sql`${toDate}::date`
      : isSubDay
        ? Prisma.sql`NOW()`
        : Prisma.sql`CURRENT_DATE`;
  }

  return { seriesStart, seriesEnd, dateCast, intervalSql, unit };
}

export const analyticsRouter = router({
  live: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: input.eventId, ...ACTIVE },
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
          where: { id: input.eventId, ...ACTIVE },
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
      const [tapCounts, totalBandCount, event, repeatBandsResult] = await Promise.all([
        db.$queryRaw<[{ total_taps: bigint; unique_bands: bigint }]>(Prisma.sql`
          SELECT
            COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS total_taps,
            COUNT(DISTINCT tl."bandId")::int AS unique_bands
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          WHERE tl."eventId" = ${input.eventId}
            ${dateFilter}
            ${windowFilter}
        `),
        db.band.count({ where: { eventId: input.eventId, ...ACTIVE } }),
        db.event.findUnique({ where: { id: input.eventId }, select: { estimatedAttendees: true } }),
        db.$queryRaw<[{ repeat_bands: bigint }]>(Prisma.sql`
          SELECT COUNT(*)::int AS repeat_bands FROM (
            SELECT tl."bandId" FROM "TapLog" tl
            INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
            WHERE tl."eventId" = ${input.eventId}
              ${dateFilter}
              ${windowFilter}
            GROUP BY tl."bandId"
            HAVING COUNT(DISTINCT tl."tappedAt") > 1
          ) sub
        `),
      ]);
      const uniqueBands = Number(tapCounts[0]?.unique_bands ?? 0);
      const estimatedAttendees = event?.estimatedAttendees ?? null;

      let engagementPercent: number;
      let bandCount: number;
      if (hasFilters) {
        // When filtered, use unique bands from filtered query as the band count
        // and derive engagement using estimatedAttendees as denominator
        bandCount = uniqueBands;
        engagementPercent = estimatedAttendees && estimatedAttendees > 0
          ? Math.round((uniqueBands / estimatedAttendees) * 10000) / 100
          : 0;
      } else {
        bandCount = totalBandCount;
        const estimatedAttendeesMap = new Map([[input.eventId, estimatedAttendees]]);
        const engagementMap = await getEventEngagement([input.eventId], estimatedAttendeesMap);
        engagementPercent = engagementMap.get(input.eventId)?.engagementPercent ?? 0;
      }

      return {
        bandCount,
        tapCount: Number(tapCounts[0]?.total_taps ?? 0),
        uniqueBands,
        repeatBands: Number(repeatBandsResult[0]?.repeat_bands ?? 0),
        engagementPercent,
        estimatedAttendees,
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
        const [redisAnalytics, liveEvent] = await Promise.all([
          getAnalytics(eventId),
          db.event.findUnique({ where: { id: eventId }, select: { estimatedAttendees: true } }),
        ]);

        const { totalTaps, uniqueTaps, byMode } = redisAnalytics;
        const liveEstimatedAttendees = liveEvent?.estimatedAttendees ?? null;
        const minutesInRange = Math.max(1, (now.getTime() - fromDate.getTime()) / 60000);
        const tpm = Math.round((totalTaps / minutesInRange) * 100) / 100;
        const bandActivityPercent = liveEstimatedAttendees && liveEstimatedAttendees > 0
          ? Math.round((uniqueTaps / liveEstimatedAttendees) * 100)
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

      // Apply org-scoping and optional single-event filter
      const eventWhere: Prisma.EventWhereInput = { ...getOrgFilter(ctx, orgId) };
      if (ctx.user.role === "ADMIN" && eventId) {
        eventWhere.id = eventId;
      }

      // Get event IDs + estimatedAttendees matching org scope
      const events = await db.event.findMany({
        where: { ...eventWhere, ...ACTIVE },
        select: { id: true, estimatedAttendees: true },
      });
      const eventIds = events.map(e => e.id);

      // Apply event filtering to tap logs
      const tapLogWhere: Prisma.TapLogWhereInput = {
        ...dateWhere,
        ...(eventIds.length > 0 && { eventId: { in: eventIds } }),
        ...(eventId && { eventId }),
        band: { deletedAt: null },
      };

      // Build event filter for distinct counts query
      const distinctEventFilter = eventId
        ? Prisma.sql`AND tl."eventId" = ${eventId}`
        : eventIds.length > 0
        ? Prisma.sql`AND tl."eventId" IN (${Prisma.join(eventIds)})`
        : Prisma.sql``;

      // Execute queries in parallel — use COUNT(DISTINCT) instead of groupBy
      const [totalTaps, distinctCounts] = await Promise.all([
        // Total taps in date range
        db.tapLog.count({ where: tapLogWhere }),

        // Unique bands + active events in a single query
        db.$queryRaw<[{ unique_bands: bigint; active_events: bigint }]>(Prisma.sql`
          SELECT
            COUNT(DISTINCT tl."bandId")::int AS unique_bands,
            COUNT(DISTINCT tl."eventId")::int AS active_events
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
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
        ? Prisma.sql`AND tl."eventId" = ${eventId}`
        : eventIds.length > 0
        ? Prisma.sql`AND tl."eventId" IN (${Prisma.join(eventIds)})`
        : Prisma.sql`AND 1=1`;

      // Sum estimatedAttendees across matching events
      const totalEstimatedAttendees = events.reduce((sum, e) => {
        return e.estimatedAttendees != null ? sum + e.estimatedAttendees : sum;
      }, 0);

      // Execute additional queries in parallel
      const [peakTpmResult, modeDist] = await Promise.all([
        // Peak TPM: max taps in any single minute
        db.$queryRaw<Array<{ minute: Date; count: bigint }>>(Prisma.sql`
          SELECT DATE_TRUNC('minute', "tappedAt") as minute, COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int as count
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          WHERE "tappedAt" >= ${fromDate} AND "tappedAt" <= ${toDate}
            ${eventFilter}
          GROUP BY DATE_TRUNC('minute', "tappedAt")
          ORDER BY count DESC
          LIMIT 1
        `),

        // Mode distribution
        db.tapLog.groupBy({
          by: ["modeServed"],
          where: tapLogWhere,
          _count: true,
        }),
      ]);

      const peakTpm = peakTpmResult[0] ? Number(peakTpmResult[0].count) : 0;

      // Band activity % — uses estimatedAttendees as denominator
      const bandActivityPercent = totalEstimatedAttendees > 0
        ? Math.round((uniqueBands / totalEstimatedAttendees) * 100)
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

      // Apply org-scoping and optional single-event filter
      const eventWhere: Prisma.EventWhereInput = { ...getOrgFilter(ctx, orgId) };
      if (ctx.user.role === "ADMIN" && eventId) {
        eventWhere.id = eventId;
      }

      // Get event IDs matching org scope
      const events = await db.event.findMany({
        where: { ...eventWhere, ...ACTIVE },
        select: { id: true },
      });
      const eventIds = events.map(e => e.id);

      // Build event filter for raw query
      const eventFilter = eventId
        ? Prisma.sql`AND tl."eventId" = ${eventId}`
        : eventIds.length > 0
        ? Prisma.sql`AND tl."eventId" IN (${Prisma.join(eventIds)})`
        : Prisma.sql`AND 1=1`;

      // Use raw SQL for date bucketing with PostgreSQL DATE_TRUNC
      const results = await db.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        SELECT
          DATE_TRUNC('day', "tappedAt")::date as date,
          COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int as count
        FROM "TapLog" tl
        INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
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

      // Apply org-scoping
      const eventWhere: Prisma.EventWhereInput = { ...getOrgFilter(ctx, input.orgId) };

      // Get event IDs matching org scope
      const events = await db.event.findMany({
        where: { ...eventWhere, ...ACTIVE },
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
          COUNT(DISTINCT (t."bandId", t."tappedAt"))::int as "tapCount"
        FROM "TapLog" t
        INNER JOIN "Band" _b ON _b."id" = t."bandId" AND _b."deletedAt" IS NULL
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
          where: { id: eventId, ...ACTIVE },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const { dateFilter, windowFilter, fromDate, toDate } = buildDateFilter(input);
      const tz = await getEventTimezone(eventId);
      const granularity = detectGranularity(fromDate, toDate);
      const unit = granularityUnit(granularity);
      const isSubDay = granularity === "hourly" || granularity === "minute";
      const truncUnit = Prisma.raw(`'${unit}'`);
      const dateCast = isSubDay ? Prisma.sql`` : Prisma.raw("::date");
      const intervalSql = Prisma.raw(`'${granularityInterval(granularity)}'::interval`);

      const seriesStart = fromDate
        ? Prisma.sql`DATE_TRUNC(${truncUnit}, ${fromDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : Prisma.sql`DATE_TRUNC(${truncUnit}, (SELECT MIN("tappedAt") FROM "TapLog" WHERE "eventId" = ${eventId}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;
      const seriesEnd = toDate
        ? Prisma.sql`(${toDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : isSubDay
          ? Prisma.sql`(NOW() AT TIME ZONE ${tz})`
          : Prisma.sql`(NOW() AT TIME ZONE ${tz})::date`;

      const dateSeries = Prisma.sql`SELECT generate_series(${seriesStart}, ${seriesEnd}, ${intervalSql})${dateCast} AS date`;

      const truncExpr = Prisma.sql`DATE_TRUNC(${truncUnit}, "tappedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;

      const results = await db.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          ${dateSeries}
        ),
        daily_counts AS (
          SELECT
            ${truncExpr} AS date,
            COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS count
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          WHERE tl."eventId" = ${eventId}
            ${dateFilter}
            ${windowFilter}
          GROUP BY 1
        )
        SELECT
          ds.date,
          COALESCE(dc.count, 0)::int AS count
        FROM date_series ds
        LEFT JOIN daily_counts dc ON ds.date = dc.date
        ORDER BY ds.date ASC
      `);

      return {
        granularity,
        data: results.map((row) => ({
          date: formatGranularLabel(row.date, granularity),
          bucketStart: localToUtcIso(row.date, tz),
          bucketEnd: localToUtcIso(getBucketEnd(row.date, granularity), tz),
          interactions: Number(row.count),
        })),
      };
    }),

  registrationGrowth: protectedProcedure
    .input(eventAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { eventId } = input;

      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: eventId, ...ACTIVE },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const { fromDate, toDate } = buildDateFilter(input);
      const tz = await getEventTimezone(eventId);
      const granularity = detectGranularity(fromDate, toDate);
      const unit = granularityUnit(granularity);
      const isSubDay = granularity === "hourly" || granularity === "minute";
      const truncUnit = Prisma.raw(`'${unit}'`);
      const dateCast = isSubDay ? Prisma.sql`` : Prisma.raw("::date");
      const intervalSql = Prisma.raw(`'${granularityInterval(granularity)}'::interval`);

      // Bound generate_series with filter dates when available
      const seriesStart = fromDate
        ? Prisma.sql`DATE_TRUNC(${truncUnit}, ${fromDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : Prisma.sql`DATE_TRUNC(${truncUnit}, (SELECT "createdAt" FROM "Event" WHERE "id" = ${eventId}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;
      const seriesEnd = toDate
        ? Prisma.sql`(${toDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : isSubDay
          ? Prisma.sql`(NOW() AT TIME ZONE ${tz})`
          : Prisma.sql`(NOW() AT TIME ZONE ${tz})::date`;

      const dateSeries = Prisma.sql`SELECT generate_series(${seriesStart}, ${seriesEnd}, ${intervalSql})${dateCast} AS date`;

      const truncExpr = Prisma.sql`DATE_TRUNC(${truncUnit}, first_tap_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;

      // Date filter on first_tap_at (not tappedAt) — windowFilter dropped intentionally:
      // first tap should span all windows to correctly identify when a band first appeared.
      const firstTapDateFilter = (() => {
        const parts: Prisma.Sql[] = [];
        if (input.from) parts.push(Prisma.sql`AND first_tap_at >= ${new Date(input.from)}`);
        if (input.to) parts.push(Prisma.sql`AND first_tap_at <= ${new Date(input.to)}`);
        return parts.length > 0 ? Prisma.sql`${Prisma.join(parts, " ")}` : Prisma.sql``;
      })();

      const results = await db.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          ${dateSeries}
        ),
        first_taps AS (
          SELECT tl."bandId", MIN("tappedAt") AS first_tap_at
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          WHERE tl."eventId" = ${eventId}
          GROUP BY tl."bandId"
        ),
        daily_counts AS (
          SELECT
            ${truncExpr} AS date,
            COUNT(*)::int AS count
          FROM first_taps
          WHERE 1=1
            ${firstTapDateFilter}
          GROUP BY 1
        )
        SELECT
          ds.date,
          COALESCE(dc.count, 0)::int AS count
        FROM date_series ds
        LEFT JOIN daily_counts dc ON ds.date = dc.date
        ORDER BY ds.date ASC
      `);

      return {
        granularity,
        data: results.map((row) => ({
          date: formatGranularLabel(row.date, granularity),
          bucketStart: localToUtcIso(row.date, tz),
          bucketEnd: localToUtcIso(getBucketEnd(row.date, granularity), tz),
          count: Number(row.count),
        })),
      };
    }),

  engagementByWindow: protectedProcedure
    .input(eventAnalyticsFilterInput.omit({ windowId: true }))
    .query(async ({ ctx, input }) => {
      const { eventId } = input;

      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: eventId, ...ACTIVE },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      // Fetch event's windows for CROSS JOIN labels
      const windows = await db.eventWindow.findMany({
        where: { eventId },
        select: { id: true, title: true, windowType: true },
        orderBy: { startTime: "asc" },
      });

      if (windows.length === 0) return { granularity: "daily" as Granularity, data: [] };

      const fromDate = input.from ? new Date(input.from) : undefined;
      const toDate = input.to ? new Date(input.to) : undefined;

      const dateFilter = fromDate && toDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate} AND tl."tappedAt" <= ${toDate}`
        : fromDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate}`
        : toDate
        ? Prisma.sql`AND tl."tappedAt" <= ${toDate}`
        : Prisma.sql``;

      const tz = await getEventTimezone(eventId);
      const granularity = detectGranularity(fromDate, toDate);
      const unit = granularityUnit(granularity);
      const isSubDay = granularity === "hourly" || granularity === "minute";
      const truncUnit = Prisma.raw(`'${unit}'`);
      const dateCast = isSubDay ? Prisma.sql`` : Prisma.raw("::date");
      const intervalSql = Prisma.raw(`'${granularityInterval(granularity)}'::interval`);

      const seriesStart = fromDate
        ? Prisma.sql`DATE_TRUNC(${truncUnit}, ${fromDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : Prisma.sql`DATE_TRUNC(${truncUnit}, (SELECT MIN("tappedAt") FROM "TapLog" WHERE "eventId" = ${eventId}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;
      const seriesEnd = toDate
        ? Prisma.sql`(${toDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : isSubDay
          ? Prisma.sql`(NOW() AT TIME ZONE ${tz})`
          : Prisma.sql`(NOW() AT TIME ZONE ${tz})::date`;

      const dateSeries = Prisma.sql`SELECT generate_series(${seriesStart}, ${seriesEnd}, ${intervalSql})${dateCast} AS date`;

      const truncExpr = Prisma.sql`DATE_TRUNC(${truncUnit}, tl."tappedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;

      // Build window VALUES list with ::text casts, plus synthetic non-window categories
      const windowEntries = [
        ...windows.map((w) => Prisma.sql`(${w.id}::text, ${w.title || w.windowType}::text)`),
        Prisma.sql`('__FALLBACK__'::text, 'Fallback'::text)`,
        Prisma.sql`('__ORG__'::text, 'Org Default'::text)`,
        Prisma.sql`('__DEFAULT__'::text, 'Default'::text)`,
      ];
      const windowNameValues = Prisma.join(windowEntries, ", ");

      const results = await db.$queryRaw<Array<{ date: Date; windowId: string; windowLabel: string; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          ${dateSeries}
        ),
        event_windows(id, label) AS (
          VALUES ${windowNameValues}
        ),
        daily_counts AS (
          SELECT
            ${truncExpr} AS date,
            CASE
              WHEN tl."windowId" IS NOT NULL THEN tl."windowId"
              WHEN e."fallbackUrl" IS NOT NULL AND tl."redirectUrl" = e."fallbackUrl" THEN '__FALLBACK__'
              WHEN o."websiteUrl" IS NOT NULL AND tl."redirectUrl" = o."websiteUrl" THEN '__ORG__'
              ELSE '__DEFAULT__'
            END AS "windowId",
            COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS count
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          INNER JOIN "Event" e ON tl."eventId" = e."id"
          INNER JOIN "Organization" o ON e."orgId" = o."id"
          WHERE tl."eventId" = ${eventId}
            ${dateFilter}
          GROUP BY 1,
            CASE
              WHEN tl."windowId" IS NOT NULL THEN tl."windowId"
              WHEN e."fallbackUrl" IS NOT NULL AND tl."redirectUrl" = e."fallbackUrl" THEN '__FALLBACK__'
              WHEN o."websiteUrl" IS NOT NULL AND tl."redirectUrl" = o."websiteUrl" THEN '__ORG__'
              ELSE '__DEFAULT__'
            END
        )
        SELECT
          ds.date,
          ew.id AS "windowId",
          ew.label AS "windowLabel",
          COALESCE(dc.count, 0)::int AS count
        FROM date_series ds
        CROSS JOIN event_windows ew
        LEFT JOIN daily_counts dc ON ds.date = dc.date AND dc."windowId" = ew.id
        ORDER BY ds.date ASC, ew.label ASC
      `);

      return {
        granularity,
        data: results.map((row) => ({
          date: formatGranularLabel(row.date, granularity),
          bucketStart: localToUtcIso(row.date, tz),
          bucketEnd: localToUtcIso(getBucketEnd(row.date, granularity), tz),
          windowId: row.windowId,
          windowLabel: row.windowLabel,
          interactions: Number(row.count),
        })),
      };
    }),

  registrationGrowthByWindow: protectedProcedure
    .input(eventAnalyticsFilterInput.omit({ windowId: true }))
    .query(async ({ ctx, input }) => {
      const { eventId } = input;

      // Org-scoping for CUSTOMER role
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: eventId, ...ACTIVE },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      // Fetch event's windows for CROSS JOIN labels
      const windows = await db.eventWindow.findMany({
        where: { eventId },
        select: { id: true, title: true, windowType: true },
        orderBy: { startTime: "asc" },
      });

      if (windows.length === 0) return { granularity: "daily" as Granularity, data: [] };

      const fromDate = input.from ? new Date(input.from) : undefined;
      const toDate = input.to ? new Date(input.to) : undefined;

      const tz = await getEventTimezone(eventId);
      const granularity = detectGranularity(fromDate, toDate);
      const unit = granularityUnit(granularity);
      const isSubDay = granularity === "hourly" || granularity === "minute";
      const truncUnit = Prisma.raw(`'${unit}'`);
      const dateCast = isSubDay ? Prisma.sql`` : Prisma.raw("::date");
      const intervalSql = Prisma.raw(`'${granularityInterval(granularity)}'::interval`);

      const seriesStart = fromDate
        ? Prisma.sql`DATE_TRUNC(${truncUnit}, ${fromDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : Prisma.sql`DATE_TRUNC(${truncUnit}, (SELECT "createdAt" FROM "Event" WHERE "id" = ${eventId}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;
      const seriesEnd = toDate
        ? Prisma.sql`(${toDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : isSubDay
          ? Prisma.sql`(NOW() AT TIME ZONE ${tz})`
          : Prisma.sql`(NOW() AT TIME ZONE ${tz})::date`;

      const dateSeries = Prisma.sql`SELECT generate_series(${seriesStart}, ${seriesEnd}, ${intervalSql})${dateCast} AS date`;

      const truncExpr = Prisma.sql`DATE_TRUNC(${truncUnit}, first_tap_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;

      // Date filter on first_tap_at
      const firstTapDateFilter = fromDate && toDate
        ? Prisma.sql`AND first_tap_at >= ${fromDate} AND first_tap_at <= ${toDate}`
        : fromDate
        ? Prisma.sql`AND first_tap_at >= ${fromDate}`
        : toDate
        ? Prisma.sql`AND first_tap_at <= ${toDate}`
        : Prisma.sql``;

      // Build window VALUES list with ::text casts, plus synthetic non-window categories
      const windowEntries = [
        ...windows.map((w) => Prisma.sql`(${w.id}::text, ${w.title || w.windowType}::text)`),
        Prisma.sql`('__FALLBACK__'::text, 'Fallback'::text)`,
        Prisma.sql`('__ORG__'::text, 'Org Default'::text)`,
        Prisma.sql`('__DEFAULT__'::text, 'Default'::text)`,
      ];
      const windowNameValues = Prisma.join(windowEntries, ", ");

      const results = await db.$queryRaw<Array<{ date: Date; windowId: string; windowLabel: string; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          ${dateSeries}
        ),
        event_windows(id, label) AS (
          VALUES ${windowNameValues}
        ),
        first_taps AS (
          SELECT
            tl."bandId",
            MIN(tl."tappedAt") AS first_tap_at,
            (
              SELECT
                CASE
                  WHEN ft."windowId" IS NOT NULL THEN ft."windowId"
                  WHEN e."fallbackUrl" IS NOT NULL AND ft."redirectUrl" = e."fallbackUrl" THEN '__FALLBACK__'
                  WHEN o."websiteUrl" IS NOT NULL AND ft."redirectUrl" = o."websiteUrl" THEN '__ORG__'
                  ELSE '__DEFAULT__'
                END
              FROM "TapLog" ft
              INNER JOIN "Event" e ON ft."eventId" = e."id"
              INNER JOIN "Organization" o ON e."orgId" = o."id"
              WHERE ft."bandId" = tl."bandId" AND ft."eventId" = ${eventId}
              ORDER BY ft."tappedAt" ASC LIMIT 1
            ) AS "windowId"
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          WHERE tl."eventId" = ${eventId}
          GROUP BY tl."bandId"
        ),
        daily_counts AS (
          SELECT
            ${truncExpr} AS date,
            "windowId",
            COUNT(*)::int AS count
          FROM first_taps
          WHERE 1=1
            ${firstTapDateFilter}
          GROUP BY 1, "windowId"
        )
        SELECT
          ds.date,
          ew.id AS "windowId",
          ew.label AS "windowLabel",
          COALESCE(dc.count, 0)::int AS count
        FROM date_series ds
        CROSS JOIN event_windows ew
        LEFT JOIN daily_counts dc ON ds.date = dc.date AND dc."windowId" = ew.id
        ORDER BY ds.date ASC, ew.label ASC
      `);

      return {
        granularity,
        data: results.map((row) => ({
          date: formatGranularLabel(row.date, granularity),
          bucketStart: localToUtcIso(row.date, tz),
          bucketEnd: localToUtcIso(getBucketEnd(row.date, granularity), tz),
          windowId: row.windowId,
          windowLabel: row.windowLabel,
          count: Number(row.count),
        })),
      };
    }),

  campaignEngagementByHour: protectedProcedure
    .input(campaignAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { campaignId, eventId } = input;

      // Get campaign's ACTIVE/COMPLETED events (with org-scoping)
      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: campaignId, ...ACTIVE },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, ...ACTIVE },
            select: { id: true, name: true },
          },
        },
      });

      enforceOrgAccess(ctx, campaign.orgId);

      const campaignEvents = eventId
        ? campaign.events.filter((e) => e.id === eventId)
        : campaign.events;

      const eventIds = campaignEvents.map((e) => e.id);

      if (eventIds.length === 0) {
        return { granularity: "daily" as Granularity, data: [] };
      }

      const { dateFilter, windowFilter, fromDate, toDate } = buildDateFilter(input);
      const tz = input.timezone ?? "UTC";
      const granularity = detectGranularity(fromDate, toDate);

      const eventFilter = eventIds.length === 1
        ? Prisma.sql`tl."eventId" = ${eventIds[0]}`
        : Prisma.sql`tl."eventId" IN (${Prisma.join(eventIds)})`;

      const { seriesStart, seriesEnd, dateCast, intervalSql, unit } = buildSeriesSql(granularity, fromDate, toDate, eventFilter, tz);

      const eventNameValues = Prisma.join(
        campaignEvents.map((e) => Prisma.sql`(${e.id}, ${e.name})`),
        ", "
      );

      const truncSql = Prisma.raw(`'${unit}'`);

      const results = await db.$queryRaw<Array<{ date: Date; eventId: string; eventName: string; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          SELECT generate_series(
            ${seriesStart},
            ${seriesEnd},
            ${intervalSql}
          )${dateCast} AS date
        ),
        campaign_events(id, name) AS (
          VALUES ${eventNameValues}
        ),
        bucket_counts AS (
          SELECT
            DATE_TRUNC(${truncSql}, ${tzExpr('"tappedAt"', tz)})${dateCast} AS date,
            tl."eventId",
            COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS count
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          INNER JOIN "Event" e ON tl."eventId" = e."id"
          WHERE ${eventFilter}
            ${dateFilter}
            ${windowFilter}
          GROUP BY 1, 2
        )
        SELECT
          ds.date,
          ce.id AS "eventId",
          ce.name AS "eventName",
          COALESCE(bc.count, 0)::int AS count
        FROM date_series ds
        CROSS JOIN campaign_events ce
        LEFT JOIN bucket_counts bc ON ds.date = bc.date AND bc."eventId" = ce.id
        ORDER BY ds.date ASC, ce.name ASC
      `);

      return {
        granularity,
        data: results.map((row) => ({
          date: formatGranularLabel(row.date, granularity),
          bucketStart: localToUtcIso(row.date, tz),
          bucketEnd: localToUtcIso(getBucketEnd(row.date, granularity), tz),
          eventId: row.eventId,
          eventName: row.eventName,
          interactions: Number(row.count),
        })),
      };
    }),

  campaignRegistrationGrowth: protectedProcedure
    .input(campaignAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { campaignId, eventId } = input;

      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: campaignId, ...ACTIVE },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, ...ACTIVE },
            select: { id: true, name: true },
          },
        },
      });

      enforceOrgAccess(ctx, campaign.orgId);

      const campaignEvents = eventId
        ? campaign.events.filter((e) => e.id === eventId)
        : campaign.events;

      const eventIds = campaignEvents.map((e) => e.id);

      if (eventIds.length === 0) {
        return { granularity: "daily" as Granularity, data: [] };
      }

      const { fromDate, toDate } = buildDateFilter(input);
      const tz = input.timezone ?? "UTC";
      const granularity = detectGranularity(fromDate, toDate);

      const eventFilter = eventIds.length === 1
        ? Prisma.sql`tl."eventId" = ${eventIds[0]}`
        : Prisma.sql`tl."eventId" IN (${Prisma.join(eventIds)})`;

      const eventIdFilter = eventIds.length === 1
        ? Prisma.sql`"id" = ${eventIds[0]}`
        : Prisma.sql`"id" IN (${Prisma.join(eventIds)})`;

      const { seriesStart: ss, seriesEnd: se, dateCast, intervalSql, unit } = buildSeriesSql(granularity, fromDate, toDate, eventFilter, tz);
      // For registration, fallback series start uses Event.createdAt instead of TapLog min
      const seriesStart = fromDate
        ? ss
        : Prisma.sql`DATE_TRUNC(${Prisma.raw(`'${unit}'`)}, (SELECT MIN("createdAt") FROM "Event" WHERE ${eventIdFilter}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;
      const seriesEnd = se;

      // Date filter on first_tap_at (not tappedAt) — windowFilter dropped intentionally:
      // first tap should span all windows to correctly identify when a band first appeared.
      const firstTapDateFilter = (() => {
        const parts: Prisma.Sql[] = [];
        if (input.from) parts.push(Prisma.sql`AND first_tap_at >= ${new Date(input.from)}`);
        if (input.to) parts.push(Prisma.sql`AND first_tap_at <= ${new Date(input.to)}`);
        return parts.length > 0 ? Prisma.sql`${Prisma.join(parts, " ")}` : Prisma.sql``;
      })();

      // Build event name lookup for SQL
      const eventNameValues = Prisma.join(
        campaignEvents.map((e) => Prisma.sql`(${e.id}, ${e.name})`),
        ", "
      );

      const truncSql = Prisma.raw(`'${unit}'`);

      const results = await db.$queryRaw<Array<{ date: Date; eventId: string; eventName: string; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          SELECT generate_series(
            ${seriesStart},
            ${seriesEnd},
            ${intervalSql}
          )${dateCast} AS date
        ),
        campaign_events(id, name) AS (
          VALUES ${eventNameValues}
        ),
        first_taps AS (
          SELECT tl."bandId", tl."eventId", MIN("tappedAt") AS first_tap_at
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          WHERE ${eventFilter}
          GROUP BY tl."bandId", tl."eventId"
        ),
        bucket_counts AS (
          SELECT
            DATE_TRUNC(${truncSql}, ${tzExpr("ft.first_tap_at", tz)})${dateCast} AS date,
            ft."eventId",
            COUNT(*)::int AS count
          FROM first_taps ft
          INNER JOIN "Event" e ON ft."eventId" = e."id"
          WHERE 1=1
            ${firstTapDateFilter}
          GROUP BY 1, 2
        )
        SELECT
          ds.date,
          ce.id AS "eventId",
          ce.name AS "eventName",
          COALESCE(bc.count, 0)::int AS count
        FROM date_series ds
        CROSS JOIN campaign_events ce
        LEFT JOIN bucket_counts bc ON ds.date = bc.date AND bc."eventId" = ce.id
        ORDER BY ds.date ASC, ce.name ASC
      `);

      return {
        granularity,
        data: results.map((row) => ({
          date: formatGranularLabel(row.date, granularity),
          bucketStart: localToUtcIso(row.date, tz),
          bucketEnd: localToUtcIso(getBucketEnd(row.date, granularity), tz),
          eventId: row.eventId,
          eventName: row.eventName,
          count: Number(row.count),
        })),
      };
    }),

  campaignUniqueTapsTimeline: protectedProcedure
    .input(campaignAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { campaignId, eventId } = input;

      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: campaignId, ...ACTIVE },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, ...ACTIVE },
            select: { id: true, name: true },
          },
        },
      });

      enforceOrgAccess(ctx, campaign.orgId);

      const campaignEvents = eventId
        ? campaign.events.filter((e) => e.id === eventId)
        : campaign.events;

      const eventIds = campaignEvents.map((e) => e.id);

      if (eventIds.length === 0) {
        return { granularity: "daily" as Granularity, data: [] };
      }

      const { fromDate, toDate } = buildDateFilter(input);
      const tz = input.timezone ?? "UTC";
      const granularity = detectGranularity(fromDate, toDate);

      const eventFilter = eventIds.length === 1
        ? Prisma.sql`tl."eventId" = ${eventIds[0]}`
        : Prisma.sql`tl."eventId" IN (${Prisma.join(eventIds)})`;

      const eventIdFilter = eventIds.length === 1
        ? Prisma.sql`"id" = ${eventIds[0]}`
        : Prisma.sql`"id" IN (${Prisma.join(eventIds)})`;

      const { seriesStart: ss, seriesEnd: se, dateCast, intervalSql, unit } = buildSeriesSql(granularity, fromDate, toDate, eventFilter, tz);
      const seriesStart = fromDate
        ? ss
        : Prisma.sql`DATE_TRUNC(${Prisma.raw(`'${unit}'`)}, (SELECT MIN("createdAt") FROM "Event" WHERE ${eventIdFilter}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;
      const seriesEnd = se;

      const tapDateFilter = (() => {
        const parts: Prisma.Sql[] = [];
        if (input.from) parts.push(Prisma.sql`AND tl."tappedAt" >= ${new Date(input.from)}`);
        if (input.to) parts.push(Prisma.sql`AND tl."tappedAt" <= ${new Date(input.to)}`);
        return parts.length > 0 ? Prisma.sql`${Prisma.join(parts, " ")}` : Prisma.sql``;
      })();

      const eventNameValues = Prisma.join(
        campaignEvents.map((e) => Prisma.sql`(${e.id}, ${e.name})`),
        ", "
      );

      const truncSql = Prisma.raw(`'${unit}'`);

      const results = await db.$queryRaw<Array<{ date: Date; eventId: string; eventName: string; uniqueCount: bigint }>>(Prisma.sql`
        WITH date_series AS (
          SELECT generate_series(
            ${seriesStart},
            ${seriesEnd},
            ${intervalSql}
          )${dateCast} AS date
        ),
        campaign_events(id, name) AS (
          VALUES ${eventNameValues}
        ),
        bucket_counts AS (
          SELECT
            DATE_TRUNC(${truncSql}, ${tzExpr('tl."tappedAt"', tz)})${dateCast} AS date,
            tl."eventId",
            COUNT(DISTINCT tl."bandId")::int AS "uniqueCount"
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          INNER JOIN "Event" e ON tl."eventId" = e."id"
          WHERE ${eventFilter}
            ${tapDateFilter}
          GROUP BY 1, 2
        )
        SELECT
          ds.date,
          ce.id AS "eventId",
          ce.name AS "eventName",
          COALESCE(bc."uniqueCount", 0)::int AS "uniqueCount"
        FROM date_series ds
        CROSS JOIN campaign_events ce
        LEFT JOIN bucket_counts bc ON ds.date = bc.date AND bc."eventId" = ce.id
        ORDER BY ds.date ASC, ce.name ASC
      `);

      return {
        granularity,
        data: results.map((row) => ({
          date: formatGranularLabel(row.date, granularity),
          bucketStart: localToUtcIso(row.date, tz),
          bucketEnd: localToUtcIso(getBucketEnd(row.date, granularity), tz),
          eventId: row.eventId,
          eventName: row.eventName,
          uniqueCount: Number(row.uniqueCount),
        })),
      };
    }),

  campaignSummary: protectedProcedure
    .input(campaignAnalyticsFilterInput)
    .query(async ({ ctx, input }) => {
      const { campaignId, eventId } = input;

      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: campaignId, ...ACTIVE },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, ...ACTIVE },
            select: { id: true, name: true, location: true, estimatedAttendees: true, _count: { select: { bands: { where: { ...ACTIVE } } } } },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      enforceOrgAccess(ctx, campaign.orgId);

      const eventIds = eventId
        ? [eventId]
        : campaign.events.map((e) => e.id);

      if (eventIds.length === 0) {
        return { eventCount: 0, bandCount: 0, tapCount: 0, uniqueBands: 0, repeatBands: 0, breakdown: [] };
      }

      const { dateFilter, windowFilter } = buildDateFilter(input);
      const hasFilters = !!(input.windowId || input.from || input.to);

      const [tapCounts, totalBandCount, perEvent, repeatBandsResult] = await Promise.all([
        db.$queryRaw<[{ total_taps: bigint; unique_bands: bigint }]>(Prisma.sql`
          SELECT
            COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS total_taps,
            COUNT(DISTINCT tl."bandId")::int AS unique_bands
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          WHERE tl."eventId" IN (${Prisma.join(eventIds)})
            ${dateFilter}
            ${windowFilter}
        `),
        db.band.count({ where: { eventId: { in: eventIds }, ...ACTIVE } }),
        db.$queryRaw<Array<{ eventId: string; total_taps: bigint; unique_bands: bigint }>>(Prisma.sql`
          SELECT
            tl."eventId",
            COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS total_taps,
            COUNT(DISTINCT tl."bandId")::int AS unique_bands
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          WHERE tl."eventId" IN (${Prisma.join(eventIds)})
            ${dateFilter}
            ${windowFilter}
          GROUP BY tl."eventId"
        `),
        db.$queryRaw<[{ repeat_bands: bigint }]>(Prisma.sql`
          SELECT COUNT(*)::int AS repeat_bands FROM (
            SELECT tl."bandId" FROM "TapLog" tl
            INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
            WHERE tl."eventId" IN (${Prisma.join(eventIds)})
              ${dateFilter}
              ${windowFilter}
            GROUP BY tl."bandId"
            HAVING COUNT(DISTINCT tl."tappedAt") > 1
          ) sub
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
        // and derive engagement using estimatedAttendees as denominator
        bandCount = uniqueBands;
        const totalEstAtt = filteredEvents.reduce((sum, e) => {
          return e.estimatedAttendees != null ? sum + e.estimatedAttendees : sum;
        }, 0);
        aggregateEngagement = totalEstAtt > 0
          ? Math.round((uniqueBands / totalEstAtt) * 10000) / 100
          : 0;
        breakdown = filteredEvents.map((e) => {
          const stats = perEventMap.get(e.id);
          const tapCount = Number(stats?.total_taps ?? 0);
          const eventUniqueBands = Number(stats?.unique_bands ?? 0);
          const estAtt = e.estimatedAttendees;
          const engagementPercent = estAtt && estAtt > 0
            ? Math.round((eventUniqueBands / estAtt) * 10000) / 100
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
        const estimatedAttendeesMap = new Map(
          filteredEvents.map((e) => [e.id, e.estimatedAttendees] as const)
        );
        const engagementMap = await getEventEngagement(eventIds, estimatedAttendeesMap);
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

      // Sum estimatedAttendees across events (skip nulls)
      const totalEstimatedAttendees = filteredEvents.reduce((sum, e) => {
        return e.estimatedAttendees != null ? sum + e.estimatedAttendees : sum;
      }, 0);

      return {
        eventCount: eventId ? 1 : campaign.events.length,
        bandCount,
        tapCount: Number(tapCounts[0]?.total_taps ?? 0),
        uniqueBands,
        repeatBands: Number(repeatBandsResult[0]?.repeat_bands ?? 0),
        aggregateEngagement,
        estimatedAttendees: totalEstimatedAttendees > 0 ? totalEstimatedAttendees : null,
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
          where: { id: eventId, ...ACTIVE },
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
              SELECT COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS count
              FROM "TapLog" tl
              INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
              WHERE tl."eventId" = ${eventId}
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
            SELECT COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS count
            FROM "TapLog" tl
            INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
            WHERE tl."eventId" = ${eventId}
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
        where: { id: campaignId, ...ACTIVE },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, ...ACTIVE },
            select: { id: true },
          },
        },
      });

      enforceOrgAccess(ctx, campaign.orgId);

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
          COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS count
        FROM "TapLog" tl
        INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
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
          where: { id: eventId, ...ACTIVE },
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
          COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS count
        FROM "TapLog" tl
        INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
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
        where: { id: campaignId, ...ACTIVE },
        select: {
          orgId: true,
          events: {
            where: { status: { in: ["ACTIVE", "COMPLETED"] }, ...ACTIVE },
            select: { id: true },
          },
        },
      });

      enforceOrgAccess(ctx, campaign.orgId);

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
          COUNT(DISTINCT (tl."bandId", tl."tappedAt"))::int AS count
        FROM "TapLog" tl
        INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
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
        const event = await db.event.findUnique({ where: { id: eventId, ...ACTIVE }, select: { orgId: true } });
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
          WHERE b."eventId" = ${eventId} AND b."firstTapAt" IS NOT NULL AND b."deletedAt" IS NULL
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
        where: { eventId, firstTapAt: { not: null }, ...ACTIVE },
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
          where: { orgId: ctx.user.orgId!, ...ACTIVE },
          select: { id: true },
        });
        where.eventId = { in: events.map(e => e.id) };
      }

      where.band = { deletedAt: null };
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
          where: { id: { in: eventIds }, orgId: ctx.user.orgId!, ...ACTIVE },
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
          COUNT(_b."id")::int AS "totalTaps",
          COUNT(DISTINCT _b."id")::int AS "uniqueBands",
          COALESCE((
            SELECT MAX(sub.cnt)
            FROM (
              SELECT COUNT(DISTINCT (tl2."bandId", tl2."tappedAt"))::int AS cnt
              FROM "TapLog" tl2
              INNER JOIN "Band" _b2 ON _b2."id" = tl2."bandId" AND _b2."deletedAt" IS NULL
              WHERE tl2."eventId" = e."id"
                AND tl2."tappedAt" >= ${fromDate} AND tl2."tappedAt" <= ${toDate}
              GROUP BY DATE_TRUNC('minute', tl2."tappedAt")
            ) sub
          ), 0)::int AS "peakTpm",
          COUNT(CASE WHEN _b."id" IS NOT NULL AND t."modeServed" = 'POST' THEN 1 END)::int AS "postEventTaps"
        FROM "Event" e
        LEFT JOIN "TapLog" t ON t."eventId" = e."id"
          AND t."tappedAt" >= ${fromDate} AND t."tappedAt" <= ${toDate}
        LEFT JOIN "Band" _b ON _b."id" = t."bandId" AND _b."deletedAt" IS NULL
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
          COUNT(_b."id")::int as "tapCount"
        FROM "Organization" o
        LEFT JOIN "Event" e ON e."orgId" = o."id"
        LEFT JOIN "TapLog" t ON t."eventId" = e."id"
          AND t."tappedAt" >= ${fromDate}
          AND t."tappedAt" <= ${toDate}
        LEFT JOIN "Band" _b ON _b."id" = t."bandId" AND _b."deletedAt" IS NULL
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

  uniqueTapsTimeline: protectedProcedure
    .input(eventAnalyticsFilterInput.omit({ windowId: true }))
    .query(async ({ ctx, input }) => {
      const { eventId } = input;

      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: eventId, ...ACTIVE },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      // Fetch event's windows for CROSS JOIN labels
      const windows = await db.eventWindow.findMany({
        where: { eventId },
        select: { id: true, title: true, windowType: true },
        orderBy: { startTime: "asc" },
      });

      if (windows.length === 0) return { granularity: "daily" as Granularity, data: [] };

      const fromDate = input.from ? new Date(input.from) : undefined;
      const toDate = input.to ? new Date(input.to) : undefined;

      const dateFilter = fromDate && toDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate} AND tl."tappedAt" <= ${toDate}`
        : fromDate
        ? Prisma.sql`AND tl."tappedAt" >= ${fromDate}`
        : toDate
        ? Prisma.sql`AND tl."tappedAt" <= ${toDate}`
        : Prisma.sql``;

      const tz = await getEventTimezone(eventId);
      const granularity = detectGranularity(fromDate, toDate);
      const unit = granularityUnit(granularity);
      const isSubDay = granularity === "hourly" || granularity === "minute";
      const truncUnit = Prisma.raw(`'${unit}'`);
      const dateCast = isSubDay ? Prisma.sql`` : Prisma.raw("::date");
      const intervalSql = Prisma.raw(`'${granularityInterval(granularity)}'::interval`);

      const seriesStart = fromDate
        ? Prisma.sql`DATE_TRUNC(${truncUnit}, ${fromDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : Prisma.sql`DATE_TRUNC(${truncUnit}, (SELECT MIN("tappedAt") FROM "TapLog" WHERE "eventId" = ${eventId}) AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;
      const seriesEnd = toDate
        ? Prisma.sql`(${toDate}::timestamptz AT TIME ZONE ${tz})${dateCast}`
        : isSubDay
          ? Prisma.sql`(NOW() AT TIME ZONE ${tz})`
          : Prisma.sql`(NOW() AT TIME ZONE ${tz})::date`;

      const dateSeries = Prisma.sql`SELECT generate_series(${seriesStart}, ${seriesEnd}, ${intervalSql})${dateCast} AS date`;

      const truncExpr = Prisma.sql`DATE_TRUNC(${truncUnit}, tl."tappedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz})${dateCast}`;

      // Build window VALUES list with ::text casts, plus synthetic non-window categories
      const windowEntries = [
        ...windows.map((w) => Prisma.sql`(${w.id}::text, ${w.title || w.windowType}::text)`),
        Prisma.sql`('__FALLBACK__'::text, 'Fallback'::text)`,
        Prisma.sql`('__ORG__'::text, 'Org Default'::text)`,
        Prisma.sql`('__DEFAULT__'::text, 'Default'::text)`,
      ];
      const windowNameValues = Prisma.join(windowEntries, ", ");

      const results = await db.$queryRaw<Array<{ date: Date; windowId: string; windowLabel: string; count: bigint }>>(Prisma.sql`
        WITH date_series AS (
          ${dateSeries}
        ),
        event_windows(id, label) AS (
          VALUES ${windowNameValues}
        ),
        daily_counts AS (
          SELECT
            ${truncExpr} AS date,
            CASE
              WHEN tl."windowId" IS NOT NULL THEN tl."windowId"
              WHEN e."fallbackUrl" IS NOT NULL AND tl."redirectUrl" = e."fallbackUrl" THEN '__FALLBACK__'
              WHEN o."websiteUrl" IS NOT NULL AND tl."redirectUrl" = o."websiteUrl" THEN '__ORG__'
              ELSE '__DEFAULT__'
            END AS "windowId",
            COUNT(DISTINCT tl."bandId")::int AS count
          FROM "TapLog" tl
          INNER JOIN "Band" _b ON _b."id" = tl."bandId" AND _b."deletedAt" IS NULL
          INNER JOIN "Event" e ON tl."eventId" = e."id"
          INNER JOIN "Organization" o ON e."orgId" = o."id"
          WHERE tl."eventId" = ${eventId}
            ${dateFilter}
          GROUP BY 1,
            CASE
              WHEN tl."windowId" IS NOT NULL THEN tl."windowId"
              WHEN e."fallbackUrl" IS NOT NULL AND tl."redirectUrl" = e."fallbackUrl" THEN '__FALLBACK__'
              WHEN o."websiteUrl" IS NOT NULL AND tl."redirectUrl" = o."websiteUrl" THEN '__ORG__'
              ELSE '__DEFAULT__'
            END
        )
        SELECT
          ds.date,
          ew.id AS "windowId",
          ew.label AS "windowLabel",
          COALESCE(dc.count, 0)::int AS count
        FROM date_series ds
        CROSS JOIN event_windows ew
        LEFT JOIN daily_counts dc ON ds.date = dc.date AND dc."windowId" = ew.id
        ORDER BY ds.date ASC, ew.label ASC
      `);

      return {
        granularity,
        data: results.map((row) => ({
          date: formatGranularLabel(row.date, granularity),
          bucketStart: localToUtcIso(row.date, tz),
          bucketEnd: localToUtcIso(getBucketEnd(row.date, granularity), tz),
          windowId: row.windowId,
          windowLabel: row.windowLabel,
          uniqueCount: Number(row.count),
        })),
      };
    }),
});
