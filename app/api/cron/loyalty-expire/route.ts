import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireLoyaltyStarsIfInactive } from "@/lib/loyalty-expiration";
import { nowInPH } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Batch job: expire loyalty for all users with balance &gt; 0 and 6+ months since last activity.
 * Allowed when invoked by Vercel Cron (`x-vercel-cron: 1` on Vercel), or manually with
 * `Authorization: Bearer <CRON_SECRET>` if `CRON_SECRET` is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  const bearerOk = Boolean(secret && auth === `Bearer ${secret}`);
  const vercelCron = request.headers.get("x-vercel-cron") === "1" && process.env.VERCEL === "1";
  if (!vercelCron && !bearerOk) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = nowInPH();
  try {
    const data = await prisma.$transaction(async (tx) => {
      const candidates = await tx.user.findMany({
        where: { loyaltyStars: { gt: 0 } },
        select: { id: true },
      });
      let expiredUsers = 0;
      let totalPointsRemoved = 0;
      for (const m of candidates) {
        const r = await expireLoyaltyStarsIfInactive(tx, m.id, now, "CRON");
        if (r.expired) {
          expiredUsers += 1;
          totalPointsRemoved += r.pointsRemoved;
        }
      }
      return { scanned: candidates.length, expiredUsers, totalPointsRemoved };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Loyalty expiration run failed.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
