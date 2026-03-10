import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@sparkmotion/database";
import { invalidateEventCache, invalidateBandCache } from "@sparkmotion/redis";
import { evaluateEventSchedule } from "../services/evaluate-schedule";
import { purgeEventFromKV } from "../services/redirect-map-generator";
import { getEventEngagement } from "../lib/engagement";
import { enforceOrgAccess } from "../lib/auth";
import { ACTIVE, DELETED } from "../lib/soft-delete";
import { createTrashProcedures } from "../lib/trash";

const STATUS_PRIORITY: Record<string, number> = {
  ACTIVE: 0,
  COMPLETED: 1,
  DRAFT: 2,
  CANCELLED: 3,
};

export const eventsRouter = router({
  list: protectedProcedure
    .input(z.object({
      orgId: z.string().optional(),
      sortBy: z.enum(["createdAt", "startDate", "endDate"]).optional(),
      sortDir: z.enum(["asc", "desc"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const where =
        ctx.user.role === "ADMIN"
          ? input?.orgId ? { orgId: input.orgId, ...ACTIVE } : { ...ACTIVE }
          : { orgId: ctx.user.orgId ?? undefined, ...ACTIVE };
      const sortBy = input?.sortBy ?? "createdAt";
      const sortDir = input?.sortDir ?? "desc";
      const events = await db.event.findMany({
        where,
        include: {
          org: true,
          windows: true,
          campaign: { select: { id: true, name: true } },
          _count: { select: { bands: { where: { ...ACTIVE } } } }
        },
      });

      // Sort by status priority, then by user-selected field
      events.sort((a, b) => {
        const sp = (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99);
        if (sp !== 0) return sp;
        const aVal = a[sortBy]?.getTime() ?? 0;
        const bVal = b[sortBy]?.getTime() ?? 0;
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      });

      // Batch engagement + tap stats via shared lib
      const eventIds = events.map((e) => e.id);
      const bandCountByEvent = new Map(events.map((e) => [e.id, e._count.bands]));
      const engagementMap = await getEventEngagement(eventIds, bandCountByEvent);

      return events.map((event) => {
        const eng = engagementMap.get(event.id);
        const tapCount = eng?.totalTaps ?? 0;
        const engagementPercent = eng?.engagementPercent ?? 0;
        return { ...event, tapCount, engagementPercent };
      });
    }),

  listIds: protectedProcedure
    .input(z.object({
      orgId: z.string().optional(),
      campaignId: z.string().optional(),
      search: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const where: any = {
        ...ACTIVE,
        ...(ctx.user.role === "CUSTOMER" ? { orgId: ctx.user.orgId } : input?.orgId ? { orgId: input.orgId } : {}),
        ...(input?.campaignId ? { campaignId: input.campaignId } : {}),
        ...(input?.search ? { name: { contains: input.search, mode: "insensitive" } } : {}),
        ...(input?.status ? { status: input.status } : {}),
      };
      const events = await db.event.findMany({
        where,
        select: { id: true },
      });
      return { ids: events.map((e) => e.id) };
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const event = await db.event.findUniqueOrThrow({
        where: { id: input.id, ...ACTIVE },
        include: {
          org: true,
          windows: true,
          bands: { where: { ...ACTIVE }, take: 100 },
          campaign: { select: { id: true, name: true } },
          _count: { select: { bands: { where: { ...ACTIVE } } } }
        },
      });

      // Compute currentMode from active windows
      const activeWindows = event.windows.filter((w) => w.isActive);
      let currentMode: "pre" | "live" | "post" = "pre";

      if (activeWindows.length > 0) {
        // Priority: LIVE > POST > PRE
        const hasLive = activeWindows.some((w) => w.windowType === "LIVE");
        const hasPost = activeWindows.some((w) => w.windowType === "POST");

        if (hasLive) {
          currentMode = "live";
        } else if (hasPost) {
          currentMode = "post";
        } else {
          currentMode = "pre";
        }
      }

      // Engagement + tap stats via shared lib
      const bandCountByEvent = new Map([[event.id, event._count.bands]]);
      const engagementMap = await getEventEngagement([event.id], bandCountByEvent);
      const eng = engagementMap.get(event.id);

      return {
        ...event,
        currentMode,
        tapCount: eng?.totalTaps ?? 0,
        engagementPercent: eng?.engagementPercent ?? 0,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        name: z.string().min(1),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
        zipcode: z.string().optional(),
        location: z.string().optional(),
        venueName: z.string().optional(),
        formattedAddress: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        timezone: z.string().optional(),
        estimatedAttendees: z.number().int().positive().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        campaignId: z.string().optional(),
        autoLifecycle: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Role-based orgId enforcement
      const orgId = ctx.user.role === "CUSTOMER"
        ? ctx.user.orgId
        : input.orgId;

      if (!orgId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "User is not assigned to an organization",
        });
      }

      return db.event.create({
        data: {
          ...input,
          orgId,
          campaignId: input.campaignId || null,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        zipcode: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        venueName: z.string().nullable().optional(),
        formattedAddress: z.string().nullable().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        timezone: z.string().nullable().optional(),
        scheduleMode: z.boolean().optional(),
        assignOnFlag: z.boolean().optional(),
        autoLifecycle: z.boolean().optional(),
        status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
        estimatedAttendees: z.number().int().positive().nullable().optional(),
        startDate: z.date().nullable().optional(),
        endDate: z.date().nullable().optional(),
        campaignId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...rawData } = input;
      const existing = await db.event.findUniqueOrThrow({
        where: { id, ...ACTIVE },
        select: { orgId: true, campaignId: true, startDate: true, endDate: true, autoLifecycle: true, status: true },
      });
      enforceOrgAccess(ctx, existing.orgId);
      // Filter out undefined values for Prisma (null is valid for nullable fields)
      const data: Record<string, any> = {};
      for (const [key, value] of Object.entries(rawData)) {
        if (value !== undefined) {
          data[key] = value;
        }
      }
      // Treat empty string as null for optional FK fields
      if (data.campaignId === "") data.campaignId = null;

      // Auto-disable autoLifecycle on manual status change
      if (data.status && data.status !== existing.status) {
        data.autoLifecycle = false;
      }

      // Auto-disable autoLifecycle when removed from campaign
      if (data.campaignId === null && existing.autoLifecycle) {
        data.autoLifecycle = false;
      }

      // Validate requirements when enabling autoLifecycle
      if (data.autoLifecycle === true) {
        const windowCount = await db.eventWindow.count({
          where: {
            eventId: id,
            startTime: { not: null },
            endTime: { not: null },
          },
        });
        const effectiveCampaignId = data.campaignId !== undefined ? data.campaignId : existing.campaignId;
        const effectiveStartDate = data.startDate !== undefined ? data.startDate : existing.startDate;
        const effectiveEndDate = data.endDate !== undefined ? data.endDate : existing.endDate;

        if (!effectiveCampaignId || !effectiveStartDate || !effectiveEndDate || windowCount === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Auto-lifecycle requires campaign assignment, start date, end date, and at least one window with start and end times",
          });
        }
      }

      const event = await db.event.update({ where: { id }, data });
      invalidateEventCache(id).catch(console.error);

      // Purge KV entries + Redis band caches when event is cancelled
      if (data.status === "CANCELLED") {
        const bands = await db.band.findMany({
          where: { eventId: id },
          select: { bandId: true },
        });
        Promise.all([
          purgeEventFromKV(id),
          ...bands.map((b) => invalidateBandCache(b.bandId)),
        ]).catch(console.error);
      }

      return event;
    }),

  toggleScheduleMode: protectedProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const event = await db.event.findUniqueOrThrow({
        where: { id: input.id, ...ACTIVE },
        select: { id: true, orgId: true, timezone: true },
      });

      enforceOrgAccess(ctx, event.orgId);

      const updatedEvent = await db.$transaction(async (tx) => {
        const updated = await tx.event.update({
          where: { id: input.id },
          data: { scheduleMode: input.enabled },
        });

        if (input.enabled) {
          await evaluateEventSchedule(tx, input.id, event.timezone);
        }

        return updated;
      });

      invalidateEventCache(input.id).catch(console.error);

      return updatedEvent;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const event = await db.event.findUniqueOrThrow({ where: { id: input.id, ...ACTIVE } });
      enforceOrgAccess(ctx, event.orgId);
      const bands = await db.band.findMany({
        where: { eventId: input.id, ...ACTIVE },
        select: { bandId: true },
      });
      const now = new Date();
      await db.$transaction([
        db.event.update({
          where: { id: input.id },
          data: {
            deletedAt: now,
            deletedBy: ctx.user.id,
            ...(event.campaignId ? { deletedCampaignId: event.campaignId, campaignId: null } : {}),
          },
        }),
        db.band.updateMany({
          where: { eventId: input.id, ...ACTIVE },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        }),
      ]);
      // Invalidate event cache (includes analytics keys) + band caches
      Promise.all([
        invalidateEventCache(input.id),
        ...bands.map((b) => invalidateBandCache(b.bandId)),
      ]).catch(console.error);
    }),

  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(50) }))
    .mutation(async ({ input, ctx }) => {
      const events = await db.event.findMany({
        where: { id: { in: input.ids }, ...ACTIVE },
      });

      if (events.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No events found" });
      }

      if (ctx.user.role === "CUSTOMER") {
        const unauthorized = events.some((e) => e.orgId !== ctx.user.orgId);
        if (unauthorized) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const bands = await db.band.findMany({
        where: { eventId: { in: input.ids }, ...ACTIVE },
        select: { bandId: true },
      });

      const now = new Date();
      const eventIds = events.map((e) => e.id);

      await db.$transaction(async (tx) => {
        // Store campaignId in deletedCampaignId for events that have one
        const eventsWithCampaign = events.filter((e) => e.campaignId);
        for (const e of eventsWithCampaign) {
          await tx.event.update({
            where: { id: e.id },
            data: { deletedCampaignId: e.campaignId, campaignId: null },
          });
        }
        await tx.event.updateMany({
          where: { id: { in: eventIds } },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        });
        await tx.band.updateMany({
          where: { eventId: { in: eventIds }, ...ACTIVE },
          data: { deletedAt: now, deletedBy: ctx.user.id },
        });
      });

      // Invalidate event caches (includes analytics keys) + band caches
      Promise.all([
        ...events.map((e) => invalidateEventCache(e.id)),
        ...bands.map((b) => invalidateBandCache(b.bandId)),
      ]).catch(console.error);

      return { deletedCount: events.length };
    }),

  duplicate: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(50) }))
    .mutation(async ({ input, ctx }) => {
      const events = await db.event.findMany({
        where: { id: { in: input.ids }, ...ACTIVE },
        include: { windows: true },
      });

      if (events.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No events found" });
      }

      // Customers can only duplicate events in their org
      if (ctx.user.role === "CUSTOMER") {
        const unauthorized = events.some((e) => e.orgId !== ctx.user.orgId);
        if (unauthorized) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      return db.$transaction(
        events.map((event) =>
          db.event.create({
            data: {
              name: `${event.name} (Copy)`,
              orgId: event.orgId,
              campaignId: event.campaignId,
              city: event.city,
              state: event.state,
              country: event.country,
              zipcode: event.zipcode,
              location: event.location,
              venueName: event.venueName,
              formattedAddress: event.formattedAddress,
              latitude: event.latitude,
              longitude: event.longitude,
              timezone: event.timezone,
              scheduleMode: event.scheduleMode,
              autoLifecycle: event.autoLifecycle,
              fallbackUrl: event.fallbackUrl,
              estimatedAttendees: event.estimatedAttendees,
              startDate: event.startDate,
              endDate: event.endDate,
              status: "DRAFT",
              windows: {
                create: event.windows.map((w) => ({
                  windowType: w.windowType,
                  url: w.url,
                  startTime: w.startTime,
                  endTime: w.endTime,
                  isManual: w.isManual,
                  isActive: false,
                })),
              },
            },
          })
        )
      );
    }),

  cleanupOrphanedTaps: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const event = await db.event.findFirst({ where: { id: input.eventId, ...ACTIVE } });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      const result = await db.tapLog.deleteMany({
        where: {
          eventId: input.eventId,
          band: { eventId: { not: input.eventId } },
        },
      });

      invalidateEventCache(input.eventId).catch(console.error);
      return { deleted: result.count };
    }),

  toggleAutoLifecycleByCampaign: protectedProcedure
    .input(z.object({ campaignId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const campaign = await db.campaign.findUniqueOrThrow({
        where: { id: input.campaignId, ...ACTIVE },
        select: { orgId: true },
      });
      enforceOrgAccess(ctx, campaign.orgId);

      // For disable, updateMany is fine (no validation needed)
      if (!input.enabled) {
        const result = await db.event.updateMany({
          where: { campaignId: input.campaignId, ...ACTIVE },
          data: { autoLifecycle: false },
        });
        return { updated: result.count, skipped: [] as Array<{ name: string; reason: string }> };
      }

      // For enable, validate per event
      const events = await db.event.findMany({
        where: { campaignId: input.campaignId, ...ACTIVE },
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          _count: {
            select: {
              windows: {
                where: { startTime: { not: null }, endTime: { not: null } },
              },
            },
          },
        },
      });

      const qualifying: string[] = [];
      const skipped: Array<{ name: string; reason: string }> = [];

      for (const event of events) {
        const reasons: string[] = [];
        if (!event.startDate) reasons.push("No start date");
        if (!event.endDate) reasons.push("No end date");
        if (event._count.windows === 0) reasons.push("No window start/end times");

        if (reasons.length > 0) {
          skipped.push({ name: event.name, reason: reasons.join(", ") });
        } else {
          qualifying.push(event.id);
        }
      }

      if (qualifying.length > 0) {
        await db.event.updateMany({
          where: { id: { in: qualifying } },
          data: { autoLifecycle: true },
        });
      }

      return { updated: qualifying.length, skipped };
    }),

  ...createTrashProcedures({
    model: "event",
    selectFields: {
      id: true,
      name: true,
      deletedAt: true,
      deletedBy: true,
      orgId: true,
      org: { select: { name: true } },
    },
    getOrgId: (event) => event.orgId,
    onRestore: async (id, event, ctx) => {
      await db.$transaction([
        db.event.update({
          where: { id },
          data: {
            deletedAt: null,
            deletedBy: null,
            // Restore campaign association if it was stored before deletion
            ...(event.deletedCampaignId ? { campaignId: event.deletedCampaignId, deletedCampaignId: null } : {}),
          },
        }),
        // Restore bands that were cascade-deleted at the same time
        db.band.updateMany({
          where: { eventId: id, deletedAt: { gte: event.deletedAt } },
          data: { deletedAt: null, deletedBy: null },
        }),
      ]);
      return { success: true };
    },
    onRestoreAll: async (events, ctx) => {
      const eventIds = events.map((e: any) => e.id);
      await db.$transaction(async (tx) => {
        // Restore campaign associations
        const eventsWithCampaign = events.filter((e: any) => e.deletedCampaignId);
        for (const e of eventsWithCampaign) {
          await tx.event.update({
            where: { id: e.id },
            data: { campaignId: e.deletedCampaignId, deletedCampaignId: null },
          });
        }
        await tx.event.updateMany({
          where: { id: { in: eventIds } },
          data: { deletedAt: null, deletedBy: null },
        });
        await tx.band.updateMany({
          where: { eventId: { in: eventIds }, ...DELETED },
          data: { deletedAt: null, deletedBy: null },
        });
      });
      return { restored: events.length };
    },
  }),
});
