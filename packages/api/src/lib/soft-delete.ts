/** Prisma where clause filter for non-deleted (active) records */
export const ACTIVE = { deletedAt: null } as const;

/** Prisma where clause filter for soft-deleted records */
export const DELETED = { deletedAt: { not: null } } as const;
