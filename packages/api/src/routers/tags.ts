import { router, protectedProcedure } from "../trpc";
import { db } from "@sparkmotion/database";

export const tagsRouter = router({
  list: protectedProcedure.query(async () => {
    return db.bandTag.findMany({
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    });
  }),
});
