// Import type augmentation
import "@sparkmotion/auth/types/next-auth";

import { Prisma, db } from "@sparkmotion/database";
import { TRPCError, initTRPC } from "@trpc/server";

import type { Session } from "next-auth";
import { auth } from "@sparkmotion/auth";
import superjson from "superjson";

export interface TRPCContext {
  db: typeof db;
  session: Session | null;
  user: Session["user"] | null;
  headers: Headers;
}

export async function createTRPCContext(opts?: { headers?: Headers }) {
  const session = await auth();

  return {
    db,
    session,
    user: session?.user ?? null,
    headers: opts?.headers ?? new Headers(),
  };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
const middleware = t.middleware;

const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { user: ctx.user } });
});

const isAdmin = middleware(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { user: ctx.user } });
});

// Map tRPC resource names to Prisma delegate accessors for oldValue capture
// Map tRPC resource names to Prisma delegate accessors for oldValue capture
const prismaModelMap: Record<string, (id: string) => Promise<unknown>> = {
  events: (id) => db.event.findUnique({ where: { id } }),
  organizations: (id) => db.organization.findUnique({ where: { id } }),
  campaigns: (id) => db.campaign.findUnique({ where: { id } }),
  users: (id) => db.user.findUnique({ where: { id } }),
  bands: (id) => db.band.findUnique({ where: { id } }),
};

const changeLog = middleware(async ({ ctx, next, type, path, rawInput }) => {
  // Only change mutations
  if (type !== "mutation") {
    return next();
  }

  // Derive resource type from tRPC path: "events.create" → "events"
  const resourceType = path.split(".")[0] ?? "Unknown";
  const action = path.split(".").slice(1).join(".") ?? "";
  const resource =
    resourceType.charAt(0).toUpperCase() + resourceType.slice(1);

  // Extract resourceId from input if present
  let resourceId: string | null = null;
  if (rawInput && typeof rawInput === "object") {
    const input = rawInput as Record<string, unknown>;
    resourceId =
      (input.id ??
        input.eventId ??
        input.userId ??
        input.bandId ??
        input.orgId ??
        null) as string | null;
  }

  // Capture oldValue before mutation for updates/deletes
  let oldValue: Prisma.InputJsonValue | undefined = undefined;
  const isUpdateOrDelete = action.includes("update") || action.includes("delete") || action.includes("toggle") || action.includes("change") || action.includes("remove") || action.includes("restore");
  if (isUpdateOrDelete && resourceId) {
    const finder = prismaModelMap[resourceType];
    if (finder) {
      try {
        const existing = await finder(resourceId);
        if (existing != null) {
          oldValue = JSON.parse(JSON.stringify(existing)) as Prisma.InputJsonValue;
        }
      } catch {
        // Best-effort — don't block mutation if lookup fails
      }
    }
  }

  const result = await next();

  // Fire-and-forget change log write — never blocks mutation response
  const ipAddress =
    ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = ctx.headers?.get("user-agent") ?? null;

  // Capture result data as newValue for creates/updates
  let newValue: Prisma.InputJsonValue | undefined = undefined;
  if (result.ok && result.data != null) {
    try {
      newValue = JSON.parse(
        JSON.stringify(result.data)
      ) as Prisma.InputJsonValue;
    } catch {
      // Skip if serialization fails
    }
  }

  db.changeLog
    .create({
      data: {
        userId: ctx.user?.id ?? null,
        action: path,
        resource,
        resourceId,
        oldValue,
        newValue,
        ipAddress,
        userAgent,
      },
    })
    .catch((err: unknown) => {
      console.error("Change log write failed:", err);
    });

  return result;
});

export const publicProcedure = t.procedure.use(changeLog);
export const protectedProcedure = t.procedure.use(isAuthed).use(changeLog);
export const adminProcedure = t.procedure.use(isAdmin).use(changeLog);
