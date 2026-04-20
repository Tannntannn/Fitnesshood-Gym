import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("x-bootstrap-token")?.trim() ?? "";
    const expected = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim() ?? "";
    if (!expected || token !== expected) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? "admin@gym.com").trim().toLowerCase();
    const password = (process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "admin123").trim();
    if (!email || password.length < 6) {
      return NextResponse.json({ success: false, error: "Invalid bootstrap configuration." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.upsert({
      where: { email },
      update: { password: passwordHash },
      create: { email, password: passwordHash },
    });

    return NextResponse.json({ success: true, data: { email: admin.email } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Bootstrap failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

