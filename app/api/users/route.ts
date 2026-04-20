import { NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { buildQrString, generateQrBase64 } from "@/lib/qr";
import { nowInPH } from "@/lib/time";

export async function GET() {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch users", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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
    };
    if (!body.firstName || !body.lastName || !body.role) {
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
        const membershipStart = body.role === "MEMBER" ? now : null;
        const membershipExpiry = body.role === "MEMBER" ? addDays(now, 30) : null;

        const user = await prisma.user.create({
          data: {
            firstName: body.firstName,
            lastName: body.lastName,
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
          },
        });
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
