import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default function middleware(request: NextRequest) {
  const hasSessionToken =
    Boolean(request.cookies.get("next-auth.session-token")?.value) ||
    Boolean(request.cookies.get("__Secure-next-auth.session-token")?.value);

  if (hasSessionToken) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/register",
    "/register/:path*",
    "/users",
    "/users/:path*",
    "/attendance",
    "/attendance/:path*",
    "/members-management",
    "/members-management/:path*",
    "/payments",
    "/payments/:path*",
    "/payment-records",
    "/payment-records/:path*",
    "/services",
    "/services/:path*",
    "/coaches",
    "/coaches/:path*",
    "/announcements",
    "/announcements/:path*",
    "/addons",
    "/addons/:path*",
    "/loyalty",
    "/loyalty/:path*",
    "/reports",
    "/reports/:path*",
  ],
};
