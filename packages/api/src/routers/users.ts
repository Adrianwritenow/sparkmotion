import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@sparkmotion/database";

export const usersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "ADMIN") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        org: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    return db.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { id: true, name: true, email: true, role: true, timezone: true },
    });
  }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.user.update({
        where: { id: ctx.user.id },
        data: input,
        select: { id: true, name: true, email: true },
      });
    }),

  updateTimezone: protectedProcedure
    .input(z.object({ timezone: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return db.user.update({
        where: { id: ctx.user.id },
        data: { timezone: input.timezone },
        select: { id: true, timezone: true },
      });
    }),
});
