import { adminProcedure, router } from "../trpc";

import { Prisma } from "@sparkmotion/database";
import { db } from "@sparkmotion/database";
import { z } from "zod";

const changeListInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
});

type ChangeListInput = z.infer<typeof changeListInput>;

function buildWhere(
  input: Omit<ChangeListInput, "page" | "pageSize">
): Prisma.ChangeLogWhereInput {
  return {
    ...(input.from || input.to
      ? {
          createdAt: {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          },
        }
      : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.action ? { action: { contains: input.action } } : {}),
    ...(input.resource ? { resource: input.resource } : {}),
  };
}

async function resolveUsers(
  userIds: (string | null)[]
): Promise<Map<string, { name: string | null; email: string }>> {
  const uniqueIds = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (uniqueIds.length === 0) return new Map();

  const users = await db.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, email: true },
  });

  return new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
}

export const changeLogsRouter = router({
  list: adminProcedure.input(changeListInput).query(async ({ input }) => {
    const { page, pageSize, ...filters } = input;
    const where = buildWhere(filters);
    const skip = (page - 1) * pageSize;

    const [rows, total] = await db.$transaction([
      db.changeLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.changeLog.count({ where }),
    ]);

    const userMap = await resolveUsers(rows.map((r) => r.userId));

    const enrichedRows = rows.map((row) => ({
      ...row,
      user: row.userId ? (userMap.get(row.userId) ?? null) : null,
    }));

    return { rows: enrichedRows, total, page, pageSize };
  }),

  stats: adminProcedure.query(async () => {
    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [totalEvents24h, failedLogins7d, deletions7d] = await db.$transaction([
      db.changeLog.count({
        where: { createdAt: { gte: yesterday } },
      }),
      db.changeLog.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          action: { in: ["auth.login_failure", "auth.lockout"] },
        },
      }),
      db.changeLog.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
          action: { contains: "delete" },
        },
      }),
    ]);

    const topUserGroups = await db.changeLog.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: sevenDaysAgo }, userId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    });

    let mostActiveUser: { name: string | null; email: string; count: number } | null = null;

    const topGroup = topUserGroups[0];
    if (topGroup && topGroup.userId) {
      const topUserId = topGroup.userId;
      const count = topGroup._count.id;
      const user = await db.user.findUnique({
        where: { id: topUserId },
        select: { name: true, email: true },
      });
      if (user) {
        mostActiveUser = { name: user.name, email: user.email, count };
      }
    }

    return { totalEvents24h, failedLogins7d, deletions7d, mostActiveUser };
  }),

  export: adminProcedure
    .input(changeListInput.omit({ page: true, pageSize: true }))
    .query(async ({ input }) => {
      const where = buildWhere(input);

      const rows = await db.changeLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10000,
      });

      const userMap = await resolveUsers(rows.map((r) => r.userId));

      return rows.map((row) => ({
        ...row,
        user: row.userId ? (userMap.get(row.userId) ?? null) : null,
      }));
    }),
});
