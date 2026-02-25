import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";

const cookiePrefix = process.env.AUTH_COOKIE_PREFIX || "authjs";

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}.session-token`,
    },
    callbackUrl: {
      name: `${cookiePrefix}.callback-url`,
    },
    csrfToken: {
      name: `${cookiePrefix}.csrf-token`,
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.email = user.email as string;
        token.name = user.name ?? null;
        token.role = user.role;
        token.orgId = user.orgId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name ?? null;
        session.user.role = token.role;
        session.user.orgId = token.orgId;
      }
      return session;
    },
  },
  providers: [], // Providers will be added in auth.ts
} satisfies NextAuthConfig;
