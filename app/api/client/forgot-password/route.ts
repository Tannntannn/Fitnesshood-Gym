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

    if (!user?.email) {
      console.info("[forgot-password] skipped send: user_not_found", { email });
      return genericSuccess;
    }

    if (!user.memberPasswordHash) {
      console.info("[forgot-password] skipped send: account_not_activated", { email });
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
    console.info("[forgot-password] attempting resend send", { email });
    await sendResetEmail(user.email, resetLink);
    console.info("[forgot-password] resend send success", { email });

    return genericSuccess;
  } catch (error) {
    console.error("[forgot-password] request failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
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

