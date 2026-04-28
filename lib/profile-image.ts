import { createClient } from "@supabase/supabase-js";

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
    return data.signedUrl;
  } catch {
    return url;
  }
}
