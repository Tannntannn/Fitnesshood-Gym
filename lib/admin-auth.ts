import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";

/** Cookie header → shape NextAuth `SessionStore` expects (`cookies.getAll()`). */
function cookiesFromHeader(cookieHeader: string | null) {
  const pairs: { name: string; value: string }[] = [];
  if (!cookieHeader?.trim()) return { getAll: () => pairs as { name: string; value: string }[] };
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    pairs.push({ name, value });
  }
  return { getAll: () => pairs };
}

/**
 * Resolves admin session for API routes and RSC. Uses `getServerSession` first; if that
 * returns null (e.g. iframe / embedded context), falls back to `getToken` with a proper
 * `req.cookies` shape — NextAuth's JWT helper does not read the session from a bare
 * `{ headers: { cookie } }` object alone.
 */
export async function requireAdminSession(req?: NextRequest): Promise<Session | null> {
  const session = await getServerSession(authOptions);
  if (session?.admin?.id) return session;

  const secret = authOptions.secret;
  if (typeof secret !== "string" || !secret.trim()) return null;

  try {
    const headerList = req?.headers ?? headers();
    const cookieHeader =
      typeof headerList.get === "function" ? headerList.get("cookie") ?? null : null;
    if (!cookieHeader) return null;

    const token = await getToken({
      req: {
        headers: headerList,
        cookies: cookiesFromHeader(cookieHeader),
      } as NextRequest,
      secret,
    });
    if (!token) return null;
    const adminId = token.adminId;
    if (typeof adminId === "string" && adminId.length > 0) {
      const adminEmail = typeof token.adminEmail === "string" ? token.adminEmail : "";
      return {
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        user: { name: null, email: null, image: null },
        admin: {
          id: adminId,
          email: adminEmail,
        },
      };
    }
  } catch {
    // ignore JWT parse errors
  }
  return null;
}

