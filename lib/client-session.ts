import crypto from "crypto";

const CLIENT_COOKIE = "fh_client_session";

function getSecret() {
  return process.env.NEXTAUTH_SECRET ?? "fitnesshood-fallback-secret";
}

export function getClientSessionCookieName() {
  return CLIENT_COOKIE;
}

export function signClientSession(userId: string) {
  const sig = crypto.createHmac("sha256", getSecret()).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

export function verifyClientSession(value: string | undefined | null) {
  if (!value) return null;
  const [userId, sig] = value.split(".");
  if (!userId || !sig) return null;
  const expected = crypto.createHmac("sha256", getSecret()).update(userId).digest("hex");
  if (expected !== sig) return null;
  return userId;
}

