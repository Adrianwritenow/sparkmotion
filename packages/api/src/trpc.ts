import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Session } from "next-auth";
import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";
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

export const protectedProcedure = t.procedure.use(isAuthed);
export const adminProcedure = t.procedure.use(isAdmin);
