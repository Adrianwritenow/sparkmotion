import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@sparkmotion/database";

export const organizationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "ADMIN") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return db.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { events: true } },
      },
      orderBy: { name: "asc" },
    });
  }),
});
