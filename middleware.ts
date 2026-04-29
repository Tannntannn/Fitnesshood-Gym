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
    "/dashboard/:path*",
    "/register/:path*",
    "/users/:path*",
    "/attendance/:path*",
    "/members-management",
    "/payments",
    "/payment-records",
    "/services",
    "/coaches",
  ],
};
