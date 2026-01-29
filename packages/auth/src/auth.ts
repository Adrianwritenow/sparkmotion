import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import bcrypt from "bcryptjs";
import { z } from "zod";

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

        const remoteUrl = process.env.AUTH_REMOTE_URL;
        if (remoteUrl) {
          const response = await fetch(`${remoteUrl}/api/auth/credentials`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
          });

          if (!response.ok) {
            return null;
          }

          return response.json();
        }

        const { db } = await import("@sparkmotion/database");
        const user = await db.user.findUnique({
          where: { email },
          include: {
            orgUsers: {
              take: 1,
              orderBy: {
                id: "asc",
              },
            },
          },
        });

        if (!user || !user.password) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgUsers[0]?.orgId ?? null,
        };
      },
    }),
  ],
});
