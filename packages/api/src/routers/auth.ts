import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { db } from "@sparkmotion/database";
import { redis, KEYS } from "@sparkmotion/redis";
import { passwordSchema } from "@sparkmotion/auth/password-schema";
import { generateAndSendResetToken } from "../lib/password-reset";

const MAX_RESET_REQUESTS = 3;
const RESET_RATE_LIMIT_TTL = 3600; // 1 hour

export const authRouter = router({
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const { email } = input;

      // Rate limit: 3 requests per email per hour
      const rateLimitKey = KEYS.resetRateLimit(email);
      const count = await redis.get(rateLimitKey);
      if (count && parseInt(count, 10) >= MAX_RESET_REQUESTS) {
        // Silently return success to prevent email enumeration
        return { success: true };
      }

      const user = await db.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, role: true },
      });

      if (!user) {
        // Don't reveal whether email exists
        return { success: true };
      }

      // Increment rate limit
      const newCount = await redis.incr(rateLimitKey);
      if (newCount === 1) {
        await redis.expire(rateLimitKey, RESET_RATE_LIMIT_TTL);
      }

      await generateAndSendResetToken(user.id, user.email, user.name, user.role);

      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        password: passwordSchema,
      })
    )
    .mutation(async ({ input }) => {
      const { token: rawToken, password } = input;

      // Hash the raw token to look up in DB
      const hashedToken = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const resetToken = await db.passwordResetToken.findUnique({
        where: { token: hashedToken },
        include: { user: { select: { id: true } } },
      });

      if (!resetToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired reset link",
        });
      }

      if (resetToken.usedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This reset link has already been used",
        });
      }

      if (resetToken.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This reset link has expired",
        });
      }

      const hashed = await bcrypt.hash(password, 12);

      await db.$transaction([
        db.user.update({
          where: { id: resetToken.userId },
          data: { password: hashed, forcePasswordReset: false },
        }),
        db.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        }),
      ]);

      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({ password: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      const hashed = await bcrypt.hash(input.password, 12);
      await db.user.update({
        where: { id: ctx.user.id },
        data: { password: hashed, forcePasswordReset: false },
      });
      return { success: true };
    }),
});
