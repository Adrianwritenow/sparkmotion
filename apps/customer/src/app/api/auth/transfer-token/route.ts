import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { auth } from "@sparkmotion/auth";

const AUTH_SECRET = process.env.AUTH_SECRET!;
const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000";
const COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX || "authjs";
const TRANSFER_SALT = "cross-login-transfer";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.redirect(`${ADMIN_URL}/auth/signin`);
  }

  const token = await encode({
    token: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      orgId: session.user.orgId,
    },
    secret: AUTH_SECRET,
    salt: TRANSFER_SALT,
    maxAge: 30,
  });

  const response = NextResponse.redirect(
    `${ADMIN_URL}/api/auth/cross-login?token=${token}`
  );
  response.cookies.delete(`${COOKIE_PREFIX}.session-token`);
  response.cookies.delete(`__Secure-${COOKIE_PREFIX}.session-token`);
  return response;
}
