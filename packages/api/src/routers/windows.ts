import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../trpc";
import { db } from "@sparkmotion/database";
import { invalidateEventCache } from "@sparkmotion/redis";

export const windowsRouter = router({
  list: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ input }) => {
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

      const window = await db.eventWindow.create({ data: input });
      await invalidateEventCache(input.eventId);
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

      const updated = await db.eventWindow.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
      await invalidateEventCache(window.eventId);
      return updated;
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
      await invalidateEventCache(window.eventId);
    }),
});
