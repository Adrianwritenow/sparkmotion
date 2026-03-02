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
      const events = await db.event.findMany({
        where,
        include: {
          org: true,
          windows: true,
          campaign: { select: { id: true, name: true } },
          _count: { select: { bands: { where: { ...ACTIVE } } } }
        },
        orderBy: { [input?.sortBy ?? "createdAt"]: input?.sortDir ?? "desc" },
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
        status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
        estimatedAttendees: z.number().int().positive().nullable().optional(),
        startDate: z.date().nullable().optional(),
        endDate: z.date().nullable().optional(),
        campaignId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...rawData } = input;
      const existing = await db.event.findUniqueOrThrow({ where: { id, ...ACTIVE } });
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
