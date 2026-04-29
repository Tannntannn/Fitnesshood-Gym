import { NextResponse } from "next/server";

/** Avoid CDN / edge caching user-specific API data (critical on Vercel). */
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Cookie",
} as const;

export function jsonNoStore(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status, headers: NO_STORE_HEADERS });
}
