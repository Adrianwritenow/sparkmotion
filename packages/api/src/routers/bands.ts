import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "../trpc";
import { db } from "@sparkmotion/database";

export const bandsRouter = router({
  list: protectedProcedure
    .input(z.object({ eventId: z.string(), search: z.string().nullish(), cursor: z.string().nullish(), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const where: any = { eventId: input.eventId };
      if (input.search) {
        where.bandId = { contains: input.search, mode: "insensitive" };
      }
      const bands = await db.band.findMany({
        where,
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: { createdAt: "desc" },
      });
      let nextCursor: string | undefined;
      if (bands.length > input.limit) {
        const next = bands.pop()!;
        nextCursor = next.id;
      }
      return { bands, nextCursor };
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
        where: { id: input.eventId },
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
      return { created: result.count };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), bandId: z.string().optional(), status: z.enum(["ACTIVE", "DISABLED", "LOST"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const band = await db.band.findUnique({ where: { id: input.id }, include: { event: { select: { orgId: true } } } });
      if (!band) throw new TRPCError({ code: "NOT_FOUND", message: "Band not found" });
      if (ctx.user.role !== "ADMIN" && band.event.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.band.update({ where: { id: input.id }, data: { ...(input.bandId && { bandId: input.bandId }), ...(input.status && { status: input.status }) } });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const band = await db.band.findUnique({ where: { id: input.id }, include: { event: { select: { orgId: true } } } });
      if (!band) throw new TRPCError({ code: "NOT_FOUND", message: "Band not found" });
      if (ctx.user.role !== "ADMIN" && band.event.orgId !== ctx.user.orgId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return db.band.delete({ where: { id: input.id } });
    }),

  tapHistory: protectedProcedure
    .input(z.object({ bandId: z.string(), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      return db.tapLog.findMany({
        where: { bandId: input.bandId },
        orderBy: { tappedAt: "desc" },
        take: input.limit,
      });
    }),
});
