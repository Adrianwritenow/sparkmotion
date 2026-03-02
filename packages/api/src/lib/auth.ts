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
