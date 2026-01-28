import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX || "authjs";

export function middleware(request: NextRequest) {
  const token =
    request.cookies.get(`${COOKIE_PREFIX}.session-token`) ??
    request.cookies.get(`__Secure-${COOKIE_PREFIX}.session-token`);

  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");

  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
