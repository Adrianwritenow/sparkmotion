import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "../trpc";
import { db } from "@sparkmotion/database";
import { invalidateEventCache } from "@sparkmotion/redis";
import { generateRedirectMap } from "../services/redirect-map-generator";
import { evaluateEventSchedule } from "../services/evaluate-schedule";

export const windowsRouter = router({
  list: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ input }) => {
      // If schedule mode is on, evaluate and update window states on-demand
      const event = await db.event.findUnique({
        where: { id: input.eventId },
        select: { scheduleMode: true, timezone: true },
      });

      if (event?.scheduleMode) {
        const result = await evaluateEventSchedule(db, input.eventId, event.timezone);
        if (result.changed) {
          // Fire-and-forget: update cache and redirect map
          invalidateEventCache(input.eventId).catch(console.error);
          generateRedirectMap({ eventIds: [input.eventId] }).catch(console.error);
        }
      }

      return db.eventWindow.findMany({
        where: { eventId: input.eventId },
        orderBy: { startTime: "asc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        eventId: z.string(),
        windowType: z.enum(["PRE", "LIVE", "POST"]),
        title: z.string().optional(),
        url: z.string().url(),
        startTime: z.date(),
        endTime: z.date(),
        isManual: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // If customer role, verify event belongs to their org
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: input.eventId },
          select: { orgId: true },
        });

        if (!event || event.orgId !== ctx.user.orgId) {
          throw new Error("Event not found or access denied");
        }
      }

      // Validate startTime < endTime
      if (input.startTime >= input.endTime) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Start time must be before end time",
        });
      }

      // Check for overlapping or adjacent windows
      const overlapping = await db.eventWindow.findFirst({
        where: {
          eventId: input.eventId,
          OR: [
            { startTime: { lte: input.startTime }, endTime: { gt: input.startTime } },
            { startTime: { lt: input.endTime }, endTime: { gte: input.endTime } },
            { startTime: { gte: input.startTime }, endTime: { lte: input.endTime } },
          ],
        },
      });

      if (overlapping) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Window overlaps with an existing window. Windows must have a gap between them.",
        });
      }

      // Fetch event to check if schedule mode is on
      const event = await db.event.findUnique({
        where: { id: input.eventId },
        select: { scheduleMode: true, timezone: true },
      });

      // Use transaction so schedule re-evaluation is atomic with the create
      const window = await db.$transaction(async (tx) => {
        const created = await tx.eventWindow.create({ data: input });

        if (event?.scheduleMode) {
          await evaluateEventSchedule(tx, input.eventId, event.timezone);
        }

        return created;
      });

      invalidateEventCache(input.eventId).catch(console.error);
      generateRedirectMap({ eventIds: [input.eventId] }).catch(console.error);

      return window;
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      // Fetch window with event to check org ownership
      const window = await db.eventWindow.findUniqueOrThrow({
        where: { id: input.id },
        include: { event: true },
      });

      // If customer role, verify event belongs to their org
      if (ctx.user.role === "CUSTOMER" && window.event.orgId !== ctx.user.orgId) {
        throw new Error("Access denied");
      }

      // Use transaction to enforce one-live-window constraint and disable schedule mode
      const updated = await db.$transaction(async (tx) => {
        // If activating, deactivate all sibling windows first (silent swap)
        if (input.isActive) {
          await tx.eventWindow.updateMany({
            where: {
              eventId: window.eventId,
              id: { not: input.id },
            },
            data: { isActive: false },
          });
        }

        // Update the target window
        const updatedWindow = await tx.eventWindow.update({
          where: { id: input.id },
          data: { isActive: input.isActive },
        });

        // If event has schedule mode enabled, disable it (manual toggle exits schedule mode)
        if (window.event.scheduleMode) {
          await tx.event.update({
            where: { id: window.eventId },
            data: { scheduleMode: false },
          });
        }

        return updatedWindow;
      });

      invalidateEventCache(window.eventId).catch(console.error);
      generateRedirectMap({ eventIds: [window.eventId] }).catch(console.error);
      return updated;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        windowType: z.enum(["PRE", "LIVE", "POST"]),
        title: z.string().optional(),
        url: z.string().url(),
        startTime: z.date(),
        endTime: z.date(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await db.eventWindow.findUniqueOrThrow({
        where: { id: input.id },
        include: { event: true },
      });

      if (ctx.user.role === "CUSTOMER" && existing.event.orgId !== ctx.user.orgId) {
        throw new Error("Access denied");
      }

      // Validate startTime < endTime
      if (input.startTime >= input.endTime) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Start time must be before end time",
        });
      }

      // Check for overlapping or adjacent windows (exclude self)
      const overlapping = await db.eventWindow.findFirst({
        where: {
          eventId: existing.eventId,
          id: { not: input.id },
          OR: [
            { startTime: { lte: input.startTime }, endTime: { gt: input.startTime } },
            { startTime: { lt: input.endTime }, endTime: { gte: input.endTime } },
            { startTime: { gte: input.startTime }, endTime: { lte: input.endTime } },
          ],
        },
      });

      if (overlapping) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Window overlaps with an existing window. Windows must have a gap between them.",
        });
      }

      const { id, ...data } = input;

      // Use transaction so schedule re-evaluation is atomic with the update
      const updated = await db.$transaction(async (tx) => {
        const updatedWindow = await tx.eventWindow.update({
          where: { id },
          data,
        });

        if (existing.event.scheduleMode) {
          await evaluateEventSchedule(tx, existing.eventId, existing.event.timezone);
        }

        return updatedWindow;
      });

      invalidateEventCache(existing.eventId).catch(console.error);
      generateRedirectMap({ eventIds: [existing.eventId] }).catch(console.error);

      return updated;
    }),

  upsertFallback: protectedProcedure
    .input(z.object({ eventId: z.string(), url: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      // If customer role, verify event belongs to their org
      if (ctx.user.role === "CUSTOMER") {
        const event = await db.event.findUnique({
          where: { id: input.eventId },
          select: { orgId: true },
        });
        if (!event || event.orgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }

      const result = await db.event.update({
        where: { id: input.eventId },
        data: { fallbackUrl: input.url },
      });

      invalidateEventCache(input.eventId).catch(console.error);
      generateRedirectMap({ eventIds: [input.eventId] }).catch(console.error);
      return result;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Fetch window with event to check org ownership
      const window = await db.eventWindow.findUniqueOrThrow({
        where: { id: input.id },
        include: { event: true },
      });

      // If customer role, verify event belongs to their org
      if (ctx.user.role === "CUSTOMER" && window.event.orgId !== ctx.user.orgId) {
        throw new Error("Access denied");
      }

      await db.eventWindow.delete({ where: { id: input.id } });
      invalidateEventCache(window.eventId).catch(console.error);
      generateRedirectMap({ eventIds: [window.eventId] }).catch(console.error);
    }),
});
