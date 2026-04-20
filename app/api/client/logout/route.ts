import { NextResponse } from "next/server";
import { getClientSessionCookieName } from "@/lib/client-session";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(getClientSessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

