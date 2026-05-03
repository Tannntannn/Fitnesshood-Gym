import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getClientSessionCookieName, verifyClientSession } from "@/lib/client-session";
import { resolveProfileImageUrl } from "@/lib/profile-image";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  try {
    const cookieValue = cookies().get(getClientSessionCookieName())?.value;
    const sessionUserId = verifyClientSession(cookieValue);
    if (!sessionUserId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (sessionUserId !== params.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }

    const attendance = await prisma.attendance.findMany({
      where: { userId: params.id },
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

