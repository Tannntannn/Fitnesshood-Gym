import crypto from "crypto";
import { Resend } from "resend";

export function createResetTokenPair() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export function getResetExpiry(minutes = 15) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  );
}

export async function sendResetEmail(email: string, resetLink: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();

  if (!apiKey || !from) {
    throw new Error("Reset email is not configured. Missing RESEND_API_KEY or MAIL_FROM.");
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to: email,
    subject: "FitnessHood password reset",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0b1320;">
        <h2 style="margin-bottom: 8px;">Reset your FitnessHood password</h2>
        <p style="margin: 0 0 16px;">We received a request to reset your member account password.</p>
        <p style="margin: 0 0 16px;">
          <a href="${resetLink}" style="display:inline-block;background:#00d47d;color:#0b1320;padding:10px 14px;text-decoration:none;border-radius:8px;font-weight:600;">
            Reset Password
          </a>
        </p>
        <p style="margin: 0 0 8px;">This link expires in 15 minutes and can only be used once.</p>
        <p style="margin: 0;">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}

