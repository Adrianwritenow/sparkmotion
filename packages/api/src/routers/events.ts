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
      return db.event.findUniqueOrThrow({
        where: { id: input.id },
        include: { org: true, windows: true, bands: { take: 100 }, _count: { select: { bands: true, tapLogs: true } } },
      });
    }),

  create: adminProcedure
    .input(
      z.object({
        orgId: z.string(),
        name: z.string().min(1),
        tourName: z.string().optional(),
        slug: z.string().min(1),
        preUrl: z.string().url(),
        liveUrl: z.string().url(),
        postUrl: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      return db.event.create({ data: input });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        tourName: z.string().optional(),
        slug: z.string().min(1).optional(),
        preUrl: z.string().url().optional(),
        liveUrl: z.string().url().optional(),
        postUrl: z.string().url().optional(),
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
