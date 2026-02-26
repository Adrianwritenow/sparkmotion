import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { db } from "@sparkmotion/database";
import { generateAndSendResetToken } from "../lib/password-reset";

export const usersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "ADMIN") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    return db.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        password: true,
        invitedAt: true,
        createdAt: true,
        updatedAt: true,
        org: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    return db.user.findUniqueOrThrow({
      where: { id: ctx.user.id },
      select: { id: true, name: true, email: true, role: true, timezone: true },
    });
  }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.user.update({
        where: { id: ctx.user.id },
        data: input,
        select: { id: true, name: true, email: true },
      });
    }),

  updateTimezone: protectedProcedure
    .input(z.object({ timezone: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return db.user.update({
        where: { id: ctx.user.id },
        data: { timezone: input.timezone },
        select: { id: true, timezone: true },
      });
    }),

  createUser: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      role: z.enum(["ADMIN", "CUSTOMER"]),
      orgId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Customers must have an org
      if (input.role === "CUSTOMER" && !input.orgId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Customers must be assigned to an organization",
        });
      }

      // Check for existing user with same email
      const existing = await db.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email already exists",
        });
      }

      return db.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          orgId: input.role === "CUSTOMER" ? input.orgId : null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          org: true,
        },
      });
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent self-delete
      if (input.userId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot delete your own account",
        });
      }

      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await db.user.delete({ where: { id: input.userId } });
      return { success: true };
    }),

  sendInvite: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, name: true, role: true },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Look up inviter name for the email
      const inviter = await db.user.findUnique({
        where: { id: ctx.user.id },
        select: { name: true },
      });

      await generateAndSendResetToken(user.id, user.email, user.name, user.role, {
        isInvite: true,
        invitedByName: inviter?.name ?? null,
      });

      // Mark user as invited
      await db.user.update({
        where: { id: user.id },
        data: { invitedAt: new Date() },
      });

      return { success: true };
    }),

  adminResetUserPassword: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input }) => {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, email: true, name: true, role: true },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await generateAndSendResetToken(user.id, user.email, user.name, user.role);

      await db.user.update({
        where: { id: user.id },
        data: { forcePasswordReset: true },
      });

      return { success: true };
    }),
});
