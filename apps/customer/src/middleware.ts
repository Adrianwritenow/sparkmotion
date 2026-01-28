import NextAuth from "next-auth";
import { authConfig } from "@sparkmotion/auth/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage = req.nextUrl.pathname.startsWith("/auth");

  if (!isLoggedIn && !isAuthPage) {
    return Response.redirect(new URL("/auth/signin", req.url));
  }

  if (isLoggedIn && isAuthPage) {
    return Response.redirect(new URL("/", req.url));
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/events/:path*", "/api/trpc/:path*"],
};
