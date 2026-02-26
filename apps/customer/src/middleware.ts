import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";

const COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX || "authjs";
const AUTH_SECRET = process.env.AUTH_SECRET!;
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000";

export async function middleware(request: NextRequest) {
  const tokenCookie =
    request.cookies.get(`${COOKIE_PREFIX}.session-token`) ??
    request.cookies.get(`__Secure-${COOKIE_PREFIX}.session-token`);

  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isResetPage = request.nextUrl.pathname === "/auth/reset-password";

  if (!tokenCookie && !isAuthPage) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  if (tokenCookie && isAuthPage) {
    // Allow authenticated users to access the reset-password page
    if (isResetPage) return NextResponse.next();
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Role enforcement: only CUSTOMER users allowed on customer app
  if (tokenCookie && !isAuthPage) {
    try {
      const token = await decode({
        token: tokenCookie.value,
        secret: AUTH_SECRET,
        salt: tokenCookie.name,
      });

      if (token?.role !== "CUSTOMER") {
        const response = NextResponse.redirect(`${ADMIN_URL}/auth/signin`);
        response.cookies.delete(`${COOKIE_PREFIX}.session-token`);
        response.cookies.delete(`__Secure-${COOKIE_PREFIX}.session-token`);
        return response;
      }

      // Force password reset redirect (skip for API routes so tRPC calls work)
      if (token?.forcePasswordReset === true && !request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.redirect(new URL("/auth/reset-password", request.url));
      }
    } catch {
      // Decode failure — let NextAuth handle invalid tokens
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|api/trpc|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.ico$).*)"],
};
