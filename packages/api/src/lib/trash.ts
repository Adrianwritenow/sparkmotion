import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "@sparkmotion/database";
import { protectedProcedure, adminProcedure } from "../trpc";
import { DELETED, ACTIVE } from "./soft-delete";

type SupportedModel = "event" | "campaign" | "organization";

interface TrashProcedureOptions {
  model: SupportedModel;
  /** Select fields for listDeleted query */
  selectFields: Record<string, boolean | object>;
  /**
   * How to get orgId from a fetched entity.
   * Not used when adminOnly is true.
   */
  getOrgId?: (entity: any) => string;
  /** Organizations are admin-only — uses adminProcedure, no CUSTOMER org-scoping */
  adminOnly?: boolean;
  /**
   * Custom restore logic. If not provided, default restore clears deletedAt/deletedBy.
   * Return value becomes the mutation result.
   */
  onRestore?: (id: string, entity: any, ctx: any) => Promise<any>;
  /** Custom restoreAll logic. If not provided, default batch restore is used. */
  onRestoreAll?: (entities: any[], ctx: any) => Promise<any>;
}

/**
 * Factory that generates trashCount, listDeleted, restore, and restoreAll procedures
 * for a soft-delete entity. Handles ADMIN/CUSTOMER org-scoping automatically.
 *
 * Covers events, campaigns, and organizations.
 * Bands are excluded — their trash procedures take an additional eventId scope parameter.
 */
export function createTrashProcedures(options: TrashProcedureOptions) {
  const { model, selectFields, getOrgId, adminOnly = false, onRestore, onRestoreAll } = options;

  // Use `as any` — type safety comes from the factory's own interface and tests
  const modelClient = db[model as keyof typeof db] as any;

  const baseProcedure = adminOnly ? adminProcedure : protectedProcedure;

  const trashCount = baseProcedure.query(async ({ ctx }: { ctx: any }) => {
    const where = adminOnly || ctx.user.role === "ADMIN"
      ? { ...DELETED }
      : { orgId: ctx.user.orgId ?? undefined, ...DELETED };
    return modelClient.count({ where });
  });

  const listDeleted = baseProcedure
    .input(adminOnly
      ? z.void().optional()
      : z.object({ orgId: z.string().optional() }).optional()
    )
    .query(async ({ ctx, input }: { ctx: any; input: any }) => {
      const where = adminOnly || ctx.user.role === "ADMIN"
        ? { ...(input?.orgId ? { orgId: input.orgId } : {}), ...DELETED }
        : { orgId: ctx.user.orgId ?? undefined, ...DELETED };

      const entities = await modelClient.findMany({
        where,
        select: selectFields,
        orderBy: { deletedAt: "desc" },
      });

      // Resolve deletedBy to user name/email
      const userIds = entities.map((e: any) => e.deletedBy).filter((id: any): id is string => !!id);
      const users = userIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u.name || u.email]));

      return entities.map((e: any) => ({
        ...e,
        deletedByName: e.deletedBy ? userMap.get(e.deletedBy) ?? null : null,
      }));
    });

  const restore = baseProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }: { ctx: any; input: { id: string } }) => {
      const entity = await modelClient.findUniqueOrThrow({ where: { id: input.id } });

      if (!entity.deletedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${model.charAt(0).toUpperCase() + model.slice(1)} is not deleted`,
        });
      }

      // Org-access check for non-admin entities
      if (!adminOnly && getOrgId) {
        const entityOrgId = getOrgId(entity);
        if (ctx.user.role === "CUSTOMER" && entityOrgId !== ctx.user.orgId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      if (onRestore) {
        return onRestore(input.id, entity, ctx);
      }

      // Default: clear deletedAt/deletedBy
      await modelClient.update({
        where: { id: input.id },
        data: { deletedAt: null, deletedBy: null },
      });
      return { success: true };
    });

  const restoreAll = baseProcedure.mutation(async ({ ctx }: { ctx: any }) => {
    const where = adminOnly || ctx.user.role === "ADMIN"
      ? { ...DELETED }
      : { orgId: ctx.user.orgId ?? undefined, ...DELETED };

    const deletedEntities = await modelClient.findMany({
      where,
      select: { id: true, deletedAt: true, ...Object.fromEntries(
        Object.keys(selectFields).filter(k => k !== "id").map(k => [k, selectFields[k]])
      ) },
    });

    if (deletedEntities.length === 0) return { restored: 0 };

    if (onRestoreAll) {
      return onRestoreAll(deletedEntities, ctx);
    }

    // Default: batch restore
    const ids = deletedEntities.map((e: any) => e.id);
    await modelClient.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: null, deletedBy: null },
    });
    return { restored: deletedEntities.length };
  });

  return { trashCount, listDeleted, restore, restoreAll };
}
