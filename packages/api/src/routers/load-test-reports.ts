import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { db } from "@sparkmotion/database";

export const loadTestReportsRouter = router({
  /**
   * Import a load test report (k6 JSON summary)
   */
  import: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        testType: z.string(),
        summaryJson: z.record(z.any()),
      })
    )
    .mutation(async ({ input }) => {
      const report = await db.loadTestReport.create({
        data: input,
      });

      return report;
    }),

  /**
   * List all load test reports (ordered by most recent)
   */
  list: adminProcedure.query(async () => {
    return await db.loadTestReport.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        testType: true,
        createdAt: true,
        summaryJson: true,
      },
    });
  }),

  /**
   * Get a single load test report by ID
   */
  get: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return await db.loadTestReport.findUniqueOrThrow({
        where: { id: input.id },
      });
    }),
});
