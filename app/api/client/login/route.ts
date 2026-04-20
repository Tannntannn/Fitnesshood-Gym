import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getClientSessionCookieName, signClientSession } from "@/lib/client-session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password?.trim() ?? "";

    if (!email || !password) {
      return NextResponse.json({ success: false, error: "Email and password are required." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, memberPasswordHash: true },
    });

    if (!user?.memberPasswordHash) {
      return NextResponse.json({ success: false, error: "Invalid credentials." }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.memberPasswordHash);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Invalid credentials." }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set(getClientSessionCookieName(), signClientSession(user.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to login member", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

