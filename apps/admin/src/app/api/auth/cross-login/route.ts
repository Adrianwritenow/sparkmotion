import { NextRequest, NextResponse } from "next/server";
import { encode, decode } from "next-auth/jwt";

const AUTH_SECRET = process.env.AUTH_SECRET!;
const COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX || "authjs";
const TRANSFER_SALT = "cross-login-transfer";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }

  try {
    const payload = await decode({
      token,
      secret: AUTH_SECRET,
      salt: TRANSFER_SALT,
    });

    if (!payload || payload.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }

    const cookieName = `${COOKIE_PREFIX}.session-token`;
    const sessionToken = await encode({
      token: {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        orgId: payload.orgId,
      },
      secret: AUTH_SECRET,
      salt: cookieName,
    });

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }
}
