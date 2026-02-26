import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { db } from "@sparkmotion/database";
import { redis, KEYS } from "@sparkmotion/redis";
import bcrypt from "bcryptjs";
import { z } from "zod";

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TTL = 900; // 15 minutes

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const validated = loginSchema.safeParse(credentials);

        if (!validated.success) {
          return null;
        }

        const { email, password } = validated.data;

        // Check lockout
        const lockoutKey = KEYS.loginLockout(email);
        const attempts = await redis.get(lockoutKey);
        if (attempts && parseInt(attempts, 10) >= MAX_LOGIN_ATTEMPTS) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
          const newCount = await redis.incr(lockoutKey);
          if (newCount === 1) {
            await redis.expire(lockoutKey, LOCKOUT_TTL);
          }
          return null;
        }

        // Successful login — clear lockout
        await redis.del(lockoutKey);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgId,
          forcePasswordReset: user.forcePasswordReset,
        };
      },
    }),
  ],
});
