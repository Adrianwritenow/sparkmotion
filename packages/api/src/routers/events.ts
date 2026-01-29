import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { db } from "@sparkmotion/database";
import { invalidateEventCache } from "@sparkmotion/redis";

export const eventsRouter = router({
  list: protectedProcedure
    .input(z.object({ orgId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where =
        ctx.user.role === "ADMIN"
          ? input?.orgId ? { orgId: input.orgId } : {}
          : undefined; // customer scoping handled at app level
      return db.event.findMany({
        where,
        include: { org: true, windows: true, _count: { select: { bands: true } } },
        orderBy: { createdAt: "desc" },
      });
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const event = await db.event.findUniqueOrThrow({
        where: { id: input.id },
        include: { org: true, windows: true, bands: { take: 100 }, _count: { select: { bands: true, tapLogs: true } } },
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

      return { ...event, currentMode };
    }),

  create: protectedProcedure
    .input(
      z.object({
        orgId: z.string(),
        name: z.string().min(1),
        tourName: z.string().optional(),
        slug: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Role-based orgId enforcement
      const orgId = ctx.user.role === "CUSTOMER"
        ? ctx.user.orgId!
        : input.orgId;

      return db.event.create({ data: { ...input, orgId } });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        tourName: z.string().optional(),
        slug: z.string().min(1).optional(),
        status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const event = await db.event.update({ where: { id }, data });
      await invalidateEventCache(id);
      return event;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.event.delete({ where: { id: input.id } });
      await invalidateEventCache(input.id);
    }),
});
