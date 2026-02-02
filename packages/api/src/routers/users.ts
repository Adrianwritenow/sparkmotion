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
        orgUsers: {
          include: { org: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }),
});
