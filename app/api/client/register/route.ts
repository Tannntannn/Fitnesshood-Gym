import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      firstName?: string;
      lastName?: string;
      email?: string;
      contactNo?: string;
      address?: string;
      notes?: string;
      role?: UserRole;
      profileImageUrl?: string;
      password?: string;
      accessCode?: string;
    };

    const firstName = (body.firstName ?? "").trim().replace(/\s+/g, " ");
    const lastName = (body.lastName ?? "").trim().replace(/\s+/g, " ");
    const email = (body.email ?? "").trim().toLowerCase();
    const contactNo = (body.contactNo ?? "").trim();
    const address = (body.address ?? "").trim();
    const notes = (body.notes ?? "").trim();
    const profileImageUrl = (body.profileImageUrl ?? "").trim();
    const password = (body.password ?? "").trim();
    const accessCode = (body.accessCode ?? "").trim().toUpperCase();
    const role = body.role === "WALK_IN_REGULAR" ? "WALK_IN_REGULAR" : "WALK_IN";

    if (!firstName || !lastName || !email || !profileImageUrl || !password || !accessCode) {
      return NextResponse.json(
        { success: false, error: "First name, last name, email, photo, password, and access code are required." },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ success: false, error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const now = new Date();
    const activeCode = await prisma.walkInAccessCode.findFirst({
      where: {
        code: accessCode,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { id: true, maxUses: true, usedCount: true },
    });
    if (!activeCode || activeCode.usedCount >= activeCode.maxUses) {
      return NextResponse.json({ success: false, error: "Invalid or expired access code." }, { status: 403 });
    }

    const existingUser = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (existingUser) {
      return NextResponse.json({ success: false, error: "This email is already registered." }, { status: 409 });
    }
    const existingPending = await prisma.walkInRegistration.findFirst({
      where: { email, status: "REGISTERED" },
      select: { id: true },
    });
    if (existingPending) {
      return NextResponse.json(
        { success: false, error: "A registration request for this email is already waiting for admin approval." },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction(async (tx) => {
      await tx.walkInRegistration.create({
        data: {
          firstName,
          lastName,
          email,
          contactNo,
          address: address || null,
          notes: notes || null,
          role,
          profileImageUrl,
          passwordHash,
          accessCodeId: activeCode.id,
          status: "REGISTERED",
        },
      });
      await tx.walkInAccessCode.update({
        where: { id: activeCode.id },
        data: { usedCount: { increment: 1 }, lastUsedAt: now },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Registration submitted. Please wait for admin approval before logging in.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Request failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

