import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getClientSessionCookieName, verifyClientSession } from "@/lib/client-session";
import { resolveProfileImageUrl } from "@/lib/profile-image";

export async function GET() {
  try {
    const cookieValue = cookies().get(getClientSessionCookieName())?.value;
    const userId = verifyClientSession(cookieValue);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }

    const attendance = await prisma.attendance.findMany({
      where: { userId },
      orderBy: { scannedAt: "desc" },
      take: 20,
    });

    const imageUrl = await resolveProfileImageUrl(user.profileImageUrl);
    return NextResponse.json({ success: true, data: { user: { ...user, profileImageUrl: imageUrl }, attendance } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch member dashboard", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const cookieValue = cookies().get(getClientSessionCookieName())?.value;
    const userId = verifyClientSession(cookieValue);
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { profileImageUrl?: string };
    const profileImageUrl = body.profileImageUrl?.trim() ?? "";
    if (!profileImageUrl) {
      return NextResponse.json({ success: false, error: "Profile image URL is required." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { profileImageUrl },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update profile", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
