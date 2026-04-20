export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/register/:path*", "/users/:path*", "/attendance/:path*"],
};
