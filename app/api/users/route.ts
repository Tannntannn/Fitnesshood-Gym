import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { buildQrString, generateQrBase64 } from "@/lib/qr";
import { nowInPH } from "@/lib/time";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const searchParams = new URL(request.url).searchParams;
    const includeQr = searchParams.get("includeQr") === "true";
    const role = searchParams.get("role");
    const view = searchParams.get("view");
    const where = role ? { role: role as UserRole } : undefined;
    const select =
      view === "assignment"
        ? {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          }
        : view === "payment"
          ? {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              remainingBalance: true,
              membershipTier: true,
              addOnSubscriptions: { select: { addonName: true } },
            }
          : {
              id: true,
              firstName: true,
              lastName: true,
              contactNo: true,
              email: true,
              address: true,
              notes: true,
              profileImageUrl: true,
              membershipStart: true,
              membershipExpiry: true,
              membershipTier: true,
              lockInLabel: true,
              monthsPaid: true,
              remainingMonths: true,
              totalContractPrice: true,
              remainingBalance: true,
              role: true,
              createdAt: true,
              qrCodeImage: includeQr,
            };
    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select,
    });
    const coachRows = await prisma.$queryRaw<Array<{ id: string; coachName: string | null }>>`
      SELECT "id", "coachName"
      FROM "User"
    `;
    const coachById = coachRows.reduce<Record<string, string | null>>((acc, row) => {
      acc[row.id] = row.coachName ?? null;
      return acc;
    }, {});
    const merged = users.map((user) => ({
      ...user,
      coachName: coachById[user.id] ?? null,
    }));
    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch users", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as {
      firstName?: string;
      lastName?: string;
      contactNo?: string;
      email?: string;
      address?: string;
      notes?: string;
      profileImageUrl?: string;
      role?: UserRole;
      membershipStart?: string | null;
      membershipExpiry?: string | null;
      membershipTier?: string | null;
      lockInLabel?: string | null;
      monthlyFeeLabel?: string | null;
      membershipFeeLabel?: string | null;
      gracePeriodEnd?: string | null;
      freezeStatus?: string | null;
      membershipNotes?: string | null;
      coachName?: string | null;
    };
    const firstName = (body.firstName ?? "").trim().replace(/\s+/g, " ");
    const lastName = (body.lastName ?? "").trim().replace(/\s+/g, " ");
    if (!firstName || !lastName || !body.role) {
      return NextResponse.json({ success: false, error: "First name, last name, and role are required" }, { status: 400 });
    }
    const normalizedEmail = body.email?.trim().toLowerCase() ?? "";
    if (!normalizedEmail) {
      return NextResponse.json({ success: false, error: "Email is required." }, { status: 400 });
    }
    if (normalizedEmail) {
      const existingEmail = await prisma.user.findFirst({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (existingEmail) {
        return NextResponse.json({ success: false, error: "Email is already registered." }, { status: 409 });
      }
    }

    // Retry on rare unique QR collision to keep registration reliable.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const qrCode = buildQrString(body.role);
      const qrCodeImage = await generateQrBase64(qrCode);

      try {
        const now = nowInPH();
        let membershipStart: Date | null = null;
        let membershipExpiry: Date | null = null;
        if (body.role === "MEMBER") {
          membershipStart = body.membershipStart ? new Date(body.membershipStart) : now;
          membershipExpiry = body.membershipExpiry ? new Date(body.membershipExpiry) : addDays(membershipStart, 30);
        }

        const user = await prisma.user.create({
          data: {
            firstName,
            lastName,
            contactNo: body.contactNo ?? "",
            email: normalizedEmail || null,
            address: body.address?.trim() || null,
            notes: body.notes?.trim() || null,
            profileImageUrl: body.profileImageUrl?.trim() || null,
            role: body.role,
            qrCode,
            qrCodeImage,
            membershipStart,
            membershipExpiry,
            membershipTierStart: membershipStart,
            membershipTierExpiry: membershipExpiry,
            membershipJoinedStart: body.role === "MEMBER" ? now : null,
            membershipJoinedExpiry: body.role === "MEMBER" ? addDays(now, 365) : null,
            membershipTier: body.role === "MEMBER" ? body.membershipTier?.trim() || null : null,
            lockInLabel: body.role === "MEMBER" ? body.lockInLabel?.trim() || null : null,
            monthlyFeeLabel: body.role === "MEMBER" ? body.monthlyFeeLabel?.trim() || null : null,
            membershipFeeLabel: body.role === "MEMBER" ? body.membershipFeeLabel?.trim() || null : null,
            gracePeriodEnd: body.role === "MEMBER" && body.gracePeriodEnd ? new Date(body.gracePeriodEnd) : null,
            freezeStatus: null,
            membershipNotes: body.role === "MEMBER" ? body.membershipNotes?.trim() || null : null,
          },
        });
        if (body.coachName !== undefined) {
          await prisma.$executeRaw`
            UPDATE "User"
            SET "coachName" = ${body.coachName?.trim() || null}
            WHERE "id" = ${user.id}
          `;
        }
        return NextResponse.json({ success: true, data: user }, { status: 201 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          if (attempt < 2) continue;
          return NextResponse.json({ success: false, error: "Please try again. QR generation collision detected." }, { status: 409 });
        }
        throw error;
      }
    }

    return NextResponse.json({ success: false, error: "Unable to create user" }, { status: 500 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create user", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
