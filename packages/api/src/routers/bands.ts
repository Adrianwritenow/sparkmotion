import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "../trpc";
import { db } from "@sparkmotion/database";

export const bandsRouter = router({
  list: protectedProcedure
    .input(z.object({ eventId: z.string(), cursor: z.string().optional(), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const bands = await db.band.findMany({
        where: { eventId: input.eventId },
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
