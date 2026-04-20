import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createResetTokenPair, getAppBaseUrl, getResetExpiry, sendResetEmail } from "@/lib/password-reset";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, email: true, memberPasswordHash: true },
    });

    // Always return generic success when the request is valid to avoid account enumeration.
    const genericSuccess = NextResponse.json({
      success: true,
      message: "If the email is registered, a reset link has been sent.",
    });

    if (!user?.email || !user.memberPasswordHash) {
      return genericSuccess;
    }

    const { rawToken, tokenHash } = createResetTokenPair();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpiresAt: getResetExpiry(15),
      },
    });

    const appBaseUrl = getAppBaseUrl();
    const resetLink = `${appBaseUrl}/client/reset-password?token=${encodeURIComponent(rawToken)}`;
    await sendResetEmail(user.email, resetLink);

    return genericSuccess;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process forgot password request.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

