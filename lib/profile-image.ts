import { createClient } from "@supabase/supabase-js";

/** Cuts Supabase Storage API calls (and signed-URL egress) when the same URL is resolved repeatedly. */
const SIGNED_URL_TTL_MS = 20 * 60 * 1000;
const SIGNED_URL_CACHE_MAX = 400;
const signedUrlCache = new Map<string, { resolved: string; expiresAt: number }>();

function cacheSignedUrl(sourceUrl: string, resolved: string) {
  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
  if (signedUrlCache.size >= SIGNED_URL_CACHE_MAX) {
    const drop = Math.min(80, signedUrlCache.size);
    let i = 0;
    for (const key of Array.from(signedUrlCache.keys())) {
      signedUrlCache.delete(key);
      if (++i >= drop) break;
    }
  }
  signedUrlCache.set(sourceUrl, { resolved, expiresAt });
}

function parseSupabasePublicObjectUrl(rawUrl: string): { bucket: string; objectPath: string } | null {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.endsWith(".supabase.co")) return null;

    const marker = "/storage/v1/object/public/";
    const signMarker = "/storage/v1/object/sign/";
    const idx = url.pathname.indexOf(marker);
    const signIdx = url.pathname.indexOf(signMarker);
    if (idx === -1 && signIdx === -1) return null;

    const rest =
      idx !== -1
        ? url.pathname.slice(idx + marker.length)
        : url.pathname.slice(signIdx + signMarker.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;

    const bucket = rest.slice(0, slash);
    const objectPath = decodeURIComponent(rest.slice(slash + 1));
    if (!bucket || !objectPath) return null;
    return { bucket, objectPath };
  } catch {
    return null;
  }
}

export async function resolveProfileImageUrl(url: string | null): Promise<string | null> {
  if (!url) return null;

  const now = Date.now();
  const hit = signedUrlCache.get(url);
  if (hit && hit.expiresAt > now) return hit.resolved;

  const parsed = parseSupabasePublicObjectUrl(url);
  if (!parsed) return url;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return url;

  try {
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Signed URL fallback allows rendering even when bucket is private.
    const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.objectPath, 60 * 60 * 24);
    if (error || !data?.signedUrl) return url;
    cacheSignedUrl(url, data.signedUrl);
    return data.signedUrl;
  } catch {
    return url;
  }
}
