import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getClientSessionCookieName, verifyClientSession } from "@/lib/client-session";
import { fetchActiveClientAnnouncements } from "@/lib/announcement-db";
import { resolveProfileImageUrl } from "@/lib/profile-image";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieValue = cookies().get(getClientSessionCookieName())?.value;
    const userId = verifyClientSession(cookieValue);
    if (!userId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const data = await fetchActiveClientAnnouncements(12);

    const resolvedData = await Promise.all(
      data.map(async (row) => ({
        ...row,
        imageUrl: await resolveProfileImageUrl(row.imageUrl),
      })),
    );
    return NextResponse.json(
      { success: true, data: resolvedData },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate", Vary: "Cookie" } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch announcements.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

