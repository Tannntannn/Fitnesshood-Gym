import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getClientSessionCookieName, signClientSession } from "@/lib/client-session";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string; profileImageUrl?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password?.trim() ?? "";
    const profileImageUrl = body.profileImageUrl?.trim() ?? "";

    if (!email || !password || !profileImageUrl) {
      return NextResponse.json(
        { success: false, error: "Email, password, and profile image are required." },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json({ success: false, error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, memberPasswordHash: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "This email is not registered by admin. Please contact the gym admin." },
        { status: 403 },
      );
    }

    if (user.memberPasswordHash) {
      return NextResponse.json({ success: false, error: "Account is already activated. Please log in." }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { memberPasswordHash: hash, profileImageUrl },
    });

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
      { success: false, error: "Failed to activate member account", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

