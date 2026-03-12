import { TRPCError } from "@trpc/server";

/**
 * Throws FORBIDDEN if a CUSTOMER user tries to access a resource outside their org.
 * ADMIN users always pass. Called explicitly in procedures — not middleware (per locked decision).
 */
export function enforceOrgAccess(
  ctx: { user: { role: string; orgId?: string | null } | null },
  entityOrgId: string
): void {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ctx.user.role === "CUSTOMER" && entityOrgId !== ctx.user.orgId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

/**
 * Returns a Prisma where clause fragment for org-scoping list queries.
 * CUSTOMER: always scoped to their own org.
 * ADMIN: scoped to inputOrgId if provided, otherwise unscoped (all orgs).
 */
export function getOrgFilter(
  ctx: { user: { role: string; orgId?: string | null } | null },
  inputOrgId?: string
): { orgId?: string } {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ctx.user.role === "CUSTOMER") {
    return { orgId: ctx.user.orgId ?? undefined };
  }
  return inputOrgId ? { orgId: inputOrgId } : {};
}
