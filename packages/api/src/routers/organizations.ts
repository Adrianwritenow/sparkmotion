import { router, adminProcedure } from "../trpc";
import { db } from "@sparkmotion/database";

export const organizationsRouter = router({
  list: adminProcedure.query(async () => {
    return db.organization.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }),
});
