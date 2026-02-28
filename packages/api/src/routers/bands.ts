import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "../trpc";
import { db, Prisma } from "@sparkmotion/database";
import { invalidateEventCache, invalidateBandCache } from "@sparkmotion/redis";
import { generateRedirectMap } from "../services/redirect-map-generator";

const AUTO_ASSIGN_DISTANCE_THRESHOLD = 50; // miles

export const bandsRouter = router({
  list: protectedProcedure
    .input(z.object({ eventId: z.string(), search: z.string().nullish(), page: z.number().min(1).default(1), pageSize: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const where: any = { eventId: input.eventId, deletedAt: null };
      if (input.search) {
        where.bandId = { contains: input.search, mode: "insensitive" };
      }
      const [bands, totalCount] = await Promise.all([
        db.band.findMany({
          where,
          include: { tag: { select: { id: true, title: true } } },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          orderBy: { createdAt: "desc" },
        }),
        db.band.count({ where }),
      ]);
      return { bands, totalCount, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(totalCount / input.pageSize) };
    }),

  uploadBatch: protectedProcedure
    .input(
      z.object({
        eventId: z.string(),
        bandIds: z.array(z.string()).min(1).max(10000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const event = await db.event.findUnique({
        where: { id: input.eventId, deletedAt: null },
        select: { orgId: true },
      });
      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      }
      if (ctx.user.role !== "ADMIN" && event.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const data = input.bandIds.map((bandId) => ({
        bandId,
        eventId: input.eventId,
      }));
      const result = await db.band.createMany({ data, skipDuplicates: true });

      // Check for bands with same bandId in other events (informational)
      const existingInOtherEvents = await db.band.count({
        where: {
          bandId: { in: input.bandIds },
          eventId: { not: input.eventId },
        },
      });

      return { created: result.count, existingInOtherEvents };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      bandId: z.string().optional(),
      name: z.string().nullish(),
      email: z.string().email().or(z.literal("")).nullish(),
      tagId: z.string().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const band = await db.band.findUnique({ where: { id: input.id, deletedAt: null }, include: { event: { select: { orgId: true } } } });
      if (!band) throw new TRPCError({ code: "NOT_FOUND", message: "Band not found" });
      if (ctx.user.role !== "ADMIN" && band.event.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const data: Record<string, unknown> = {};
      if (input.bandId) data.bandId = input.bandId;
      if (input.name !== undefined) data.name = input.name || null;
      if (input.email !== undefined) data.email = input.email || null;
      if (input.tagId !== undefined) data.tagId = input.tagId || null;
      return db.band.update({ where: { id: input.id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const band = await db.band.findUnique({ where: { id: input.id, deletedAt: null }, include: { event: { select: { orgId: true } } } });
      if (!band) throw new TRPCError({ code: "NOT_FOUND", message: "Band not found" });
      if (ctx.user.role !== "ADMIN" && band.event.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.band.update({
        where: { id: input.id },
        data: { deletedAt: new Date(), deletedBy: ctx.user.id },
      });
      invalidateBandCache(band.bandId).catch(console.error);
      generateRedirectMap({ eventIds: [band.eventId] }).catch(console.error);
      return { id: input.id };
    }),

  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const bands = await db.band.findMany({
        where: { id: { in: input.ids }, deletedAt: null },
        select: { id: true, bandId: true, eventId: true, event: { select: { orgId: true } } },
      });
      if (bands.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No bands found" });
      if (ctx.user.role === "CUSTOMER") {
        if (bands.some((b) => b.event.orgId !== ctx.user.orgId)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      await db.band.updateMany({
        where: { id: { in: input.ids } },
        data: { deletedAt: new Date(), deletedBy: ctx.user.id },
      });
      const affectedEventIds = [...new Set(bands.map((b) => b.eventId))];
      Promise.all(bands.map((b) => invalidateBandCache(b.bandId))).catch(console.error);
      generateRedirectMap({ eventIds: affectedEventIds }).catch(console.error);
      return { deletedCount: bands.length };
    }),

  reassign: protectedProcedure
    .input(z.object({ id: z.string(), eventId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const band = await db.band.findUnique({
        where: { id: input.id, deletedAt: null },
        include: { event: { select: { orgId: true } } },
      });
      if (!band) throw new TRPCError({ code: "NOT_FOUND" });
      if (ctx.user.role !== "ADMIN" && band.event.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Verify target event exists and belongs to same org
      const targetEvent = await db.event.findUnique({
        where: { id: input.eventId, deletedAt: null },
        select: { orgId: true },
      });
      if (!targetEvent) throw new TRPCError({ code: "NOT_FOUND", message: "Target event not found" });
      if (targetEvent.orgId !== band.event.orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reassign band to event in different organization" });
      }
      const oldEventId = band.eventId;
      const updated = await db.band.update({
        where: { id: input.id },
        data: { eventId: input.eventId, autoAssigned: false, autoAssignDistance: null, flagged: false },
      });
      invalidateBandCache(band.bandId).catch(console.error);
      generateRedirectMap({ eventIds: [oldEventId, input.eventId] }).catch(console.error);
      return updated;
    }),

  listAll: protectedProcedure
    .input(
      z.object({
        orgId: z.string().optional(),
        search: z.string().optional(),
        autoAssignedOnly: z.boolean().optional(),
        flaggedOnly: z.boolean().optional(),
        minDistance: z.number().optional(),
        tagId: z.string().optional(),
        activityFrom: z.date().optional(),
        activityTo: z.date().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.role === "CUSTOMER" ? ctx.user.orgId! : input.orgId;

      const where: Prisma.BandWhereInput = {
        deletedAt: null,
        ...(orgId ? { event: { orgId, deletedAt: null } } : { event: { deletedAt: null } }),
        ...(input.search ? { bandId: { contains: input.search, mode: "insensitive" } } : {}),
        ...(input.autoAssignedOnly ? { autoAssigned: true } : {}),
        ...(input.flaggedOnly ? { flagged: true } : {}),
        ...(input.minDistance !== undefined ? { autoAssignDistance: { gte: input.minDistance } } : {}),
        ...(input.tagId ? { tagId: input.tagId } : {}),
        ...(input.activityFrom || input.activityTo
          ? {
              lastTapAt: {
                ...(input.activityFrom ? { gte: input.activityFrom } : {}),
                ...(input.activityTo ? { lte: input.activityTo } : {}),
              },
            }
          : {}),
      };

      const [bands, totalCount] = await Promise.all([
        db.band.findMany({
          where,
          include: {
            event: { select: { id: true, name: true, status: true } },
            tag: { select: { id: true, title: true } },
          },
          orderBy: { lastTapAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        db.band.count({ where }),
      ]);

      return { bands, totalCount, totalPages: Math.ceil(totalCount / input.pageSize), page: input.page };
    }),

  bulkReassign: protectedProcedure
    .input(
      z.object({
        bandIds: z.array(z.string()).min(1).max(500),
        targetEventId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { bandIds, targetEventId } = input;

      // Verify target event exists + auth
      const targetEvent = await db.event.findUnique({
        where: { id: targetEventId, deletedAt: null },
        select: { orgId: true },
      });
      if (!targetEvent) throw new TRPCError({ code: "NOT_FOUND", message: "Target event not found" });
      if (ctx.user.role === "CUSTOMER" && targetEvent.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Verify all source bands belong to user's org
      if (ctx.user.role === "CUSTOMER") {
        const orgBands = await db.band.count({
          where: { id: { in: bandIds }, deletedAt: null, event: { orgId: ctx.user.orgId! } },
        });
        if (orgBands !== bandIds.length) throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Get original eventIds and bandId values for collision check and cache invalidation
      const sourceBands = await db.band.findMany({
        where: { id: { in: bandIds }, deletedAt: null },
        select: { id: true, bandId: true, eventId: true },
      });
      const originalEventIds = [...new Set(sourceBands.map((b) => b.eventId))];
      const sourceBandIds = sourceBands.map((b) => b.bandId);

      // Delete any existing bands in the target event with the same bandId values
      // to prevent P2002 compound unique violation on updateMany
      await db.band.deleteMany({
        where: {
          bandId: { in: sourceBandIds },
          eventId: targetEventId,
          id: { notIn: bandIds }, // Don't delete the bands we're reassigning
        },
      });

      // Delete TapLogs for the selected bands (scoped to source events only)
      await db.tapLog.deleteMany({ where: { bandId: { in: bandIds }, eventId: { in: originalEventIds } } });

      // Reset counters and reassign to target event
      const result = await db.band.updateMany({
        where: { id: { in: bandIds } },
        data: {
          eventId: targetEventId,
          tapCount: 0,
          firstTapAt: null,
          lastTapAt: null,
          autoAssigned: false,
          autoAssignDistance: null,
          flagged: false,
        },
      });

      // Async Redis cache invalidation + KV regen — fire-and-forget
      const allEventIds = [...new Set([...originalEventIds, targetEventId])];
      Promise.all([
        ...allEventIds.map((id) => invalidateEventCache(id)),
        ...sourceBands.map((b) => invalidateBandCache(b.bandId)),
      ]).catch(console.error);
      generateRedirectMap({ eventIds: allEventIds }).catch(console.error);

      return { updated: result.count };
    }),

  activityFeed: protectedProcedure
    .input(
      z.object({
        orgId: z.string().optional(),
        eventId: z.string().optional(),
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        tagId: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.role === "CUSTOMER" ? ctx.user.orgId! : input.orgId;

      // Build event filter
      let eventFilter: Prisma.TapLogWhereInput = {};
      if (input.eventId) {
        eventFilter = { eventId: input.eventId };
      } else if (orgId) {
        const events = await db.event.findMany({ where: { orgId, deletedAt: null }, select: { id: true } });
        eventFilter = { eventId: { in: events.map((e) => e.id) } };
      }

      const where: Prisma.TapLogWhereInput = {
        ...eventFilter,
        ...(input.from || input.to
          ? {
              tappedAt: {
                ...(input.from ? { gte: new Date(input.from) } : {}),
                ...(input.to ? { lte: new Date(input.to) } : {}),
              },
            }
          : {}),
        ...(input.tagId ? { band: { tagId: input.tagId } } : {}),
      };

      const [logs, totalCount] = await Promise.all([
        db.tapLog.findMany({
          where,
          include: {
            band: {
              select: {
                bandId: true,
                name: true,
                tagId: true,
                autoAssigned: true,
                autoAssignDistance: true,
                flagged: true,
                tag: { select: { title: true } },
              },
            },
            event: { select: { name: true } },
          },
          orderBy: { tappedAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        db.tapLog.count({ where }),
      ]);

      return { logs, totalCount, totalPages: Math.ceil(totalCount / input.pageSize), page: input.page };
    }),

  resolve: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const bands = await db.band.findMany({
        where: { id: { in: input.ids }, flagged: true, deletedAt: null },
        select: { id: true, event: { select: { orgId: true } } },
      });
      if (bands.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No flagged bands found" });
      if (ctx.user.role === "CUSTOMER") {
        if (bands.some((b) => b.event.orgId !== ctx.user.orgId)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      await db.band.updateMany({
        where: { id: { in: bands.map((b) => b.id) } },
        data: { flagged: false },
      });
      return { resolvedCount: bands.length };
    }),

  tapLogs: protectedProcedure
    .input(z.object({ bandId: z.string() }))
    .query(async ({ ctx, input }) => {
      const band = await db.band.findUnique({
        where: { id: input.bandId, deletedAt: null },
        select: { event: { select: { orgId: true } } },
      });
      if (!band) throw new TRPCError({ code: "NOT_FOUND", message: "Band not found" });
      if (ctx.user.role === "CUSTOMER" && band.event.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return db.tapLog.findMany({
        where: { bandId: input.bandId },
        select: {
          id: true,
          tappedAt: true,
          modeServed: true,
          redirectUrl: true,
          event: { select: { name: true } },
          window: { select: { windowType: true, title: true } },
        },
        orderBy: { tappedAt: "desc" },
        take: 100,
      });
    }),

  flaggedCount: protectedProcedure
    .query(async ({ ctx }) => {
      const where: Prisma.BandWhereInput = {
        flagged: true,
        deletedAt: null,
        ...(ctx.user.role === "CUSTOMER" ? { event: { orgId: ctx.user.orgId!, deletedAt: null } } : { event: { deletedAt: null } }),
      };
      return db.band.count({ where });
    }),

  trashCount: protectedProcedure.query(async ({ ctx }) => {
    const where: Prisma.BandWhereInput = ctx.user.role === "ADMIN"
      ? { deletedAt: { not: null } }
      : { deletedAt: { not: null }, event: { orgId: ctx.user.orgId! } };
    return db.band.count({ where });
  }),

  listDeleted: protectedProcedure
    .input(z.object({ orgId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where: Prisma.BandWhereInput = ctx.user.role === "ADMIN"
        ? { deletedAt: { not: null }, ...(input?.orgId ? { event: { orgId: input.orgId } } : {}) }
        : { deletedAt: { not: null }, event: { orgId: ctx.user.orgId! } };
      const bands = await db.band.findMany({
        where,
        select: {
          id: true,
          bandId: true,
          deletedAt: true,
          deletedBy: true,
          eventId: true,
          event: { select: { name: true } },
        },
        orderBy: { deletedAt: "desc" },
      });
      const userIds = bands.map((b) => b.deletedBy).filter((id): id is string => !!id);
      const users = userIds.length > 0
        ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));
      return bands.map((b) => ({
        ...b,
        deletedByName: b.deletedBy ? userMap.get(b.deletedBy) ?? null : null,
      }));
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const band = await db.band.findUniqueOrThrow({
        where: { id: input.id },
        include: { event: { select: { orgId: true } } },
      });
      if (!band.deletedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Band is not deleted" });
      }
      if (ctx.user.role === "CUSTOMER" && band.event.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Check for conflict: same bandId+eventId already exists non-deleted
      const conflict = await db.band.findFirst({
        where: { bandId: band.bandId, eventId: band.eventId, deletedAt: null, id: { not: band.id } },
      });
      if (conflict) {
        return { restored: 0, skipped: 1 };
      }
      await db.band.update({
        where: { id: input.id },
        data: { deletedAt: null, deletedBy: null },
      });
      invalidateBandCache(band.bandId).catch(console.error);
      generateRedirectMap({ eventIds: [band.eventId] }).catch(console.error);
      return { restored: 1, skipped: 0 };
    }),

  restoreAll: protectedProcedure.mutation(async ({ ctx }) => {
    const where: Prisma.BandWhereInput = ctx.user.role === "ADMIN"
      ? { deletedAt: { not: null } }
      : { deletedAt: { not: null }, event: { orgId: ctx.user.orgId! } };
    const deletedBands = await db.band.findMany({
      where,
      select: { id: true, bandId: true, eventId: true },
    });
    if (deletedBands.length === 0) return { restored: 0, skipped: 0 };

    let restored = 0;
    let skipped = 0;
    for (const band of deletedBands) {
      // Check for conflict
      const conflict = await db.band.findFirst({
        where: { bandId: band.bandId, eventId: band.eventId, deletedAt: null, id: { not: band.id } },
      });
      if (conflict) {
        skipped++;
        continue;
      }
      await db.band.update({
        where: { id: band.id },
        data: { deletedAt: null, deletedBy: null },
      });
      restored++;
    }
    // Invalidate caches
    const affectedEventIds = [...new Set(deletedBands.map((b) => b.eventId))];
    Promise.all(deletedBands.map((b) => invalidateBandCache(b.bandId))).catch(console.error);
    generateRedirectMap({ eventIds: affectedEventIds }).catch(console.error);
    return { restored, skipped };
  }),
});
