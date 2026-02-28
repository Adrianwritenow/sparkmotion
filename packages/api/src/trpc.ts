import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Session } from "next-auth";
import { auth } from "@sparkmotion/auth";
import { db, Prisma } from "@sparkmotion/database";
// Import type augmentation
import "@sparkmotion/auth/types/next-auth";

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

const auditLog = middleware(async ({ ctx, next, type, path, rawInput }) => {
  // Only audit mutations
  if (type !== "mutation") {
    return next();
  }

  const result = await next();

  // Fire-and-forget audit log write — never blocks mutation response
  const ipAddress =
    ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = ctx.headers?.get("user-agent") ?? null;

  // Derive resource type from tRPC path: "events.create" → "Events"
  const resourceType = path.split(".")[0] ?? "Unknown";
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

  db.auditLog
    .create({
      data: {
        userId: ctx.user?.id ?? null,
        action: path,
        resource,
        resourceId,
        newValue,
        ipAddress,
        userAgent,
      },
    })
    .catch((err: unknown) => {
      console.error("Audit log write failed:", err);
    });

  return result;
});

export const publicProcedure = t.procedure.use(auditLog);
export const protectedProcedure = t.procedure.use(isAuthed).use(auditLog);
export const adminProcedure = t.procedure.use(isAdmin).use(auditLog);
