import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";
import { buildQrString, generateQrBase64 } from "@/lib/qr";

type Params = { params: { id: string } };

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

  try {
    const body = (await request.json()) as { decision?: "APPROVE" | "DECLINE"; reviewNotes?: string };
    const decision = body.decision;
    if (decision !== "APPROVE" && decision !== "DECLINE") {
      return NextResponse.json({ success: false, error: "Decision must be APPROVE or DECLINE." }, { status: 400 });
    }

    const registration = await prisma.walkInRegistration.findUnique({
      where: { id: params.id },
    });
    if (!registration) {
      return NextResponse.json({ success: false, error: "Registration request not found." }, { status: 404 });
    }
    if (registration.status !== "REGISTERED") {
      return NextResponse.json({ success: false, error: "This request was already reviewed." }, { status: 409 });
    }

    const reviewNotes = body.reviewNotes?.trim() || null;
    const reviewedBy = session.admin?.email ?? "admin";
    const reviewedAt = new Date();

    if (decision === "DECLINE") {
      const declined = await prisma.walkInRegistration.update({
        where: { id: params.id },
        data: {
          status: "DECLINED",
          reviewedAt,
          reviewedBy,
          reviewNotes,
        },
      });
      return NextResponse.json({ success: true, data: declined });
    }

    const existingEmail = await prisma.user.findFirst({
      where: { email: registration.email.toLowerCase() },
      select: { id: true },
    });
    if (existingEmail) {
      return NextResponse.json({ success: false, error: "This email already exists in users." }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let userId = "";
      let userCreatedAt: Date | null = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const qrCode = buildQrString(registration.role);
        const qrCodeImage = await generateQrBase64(qrCode);
        try {
          const user = await tx.user.create({
            data: {
              firstName: registration.firstName,
              lastName: registration.lastName,
              contactNo: registration.contactNo,
              email: registration.email.toLowerCase(),
              address: registration.address,
              notes: registration.notes,
              profileImageUrl: registration.profileImageUrl,
              memberPasswordHash: registration.passwordHash,
              role: registration.role,
              qrCode,
              qrCodeImage,
            },
            select: { id: true, createdAt: true },
          });
          userId = user.id;
          userCreatedAt = user.createdAt;
          break;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 2) {
            continue;
          }
          throw error;
        }
      }
      if (!userId) throw new Error("Unable to create user from registration request.");

      const approved = await tx.walkInRegistration.update({
        where: { id: registration.id },
        data: {
          status: "APPROVED",
          reviewedAt,
          reviewedBy,
          reviewNotes,
          createdUserId: userId,
        },
      });

      return { approved, userId, userCreatedAt };
    });

    return NextResponse.json({
      success: true,
      data: {
        registration: result.approved,
        createdUser: { id: result.userId, createdAt: result.userCreatedAt },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to review registration.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
