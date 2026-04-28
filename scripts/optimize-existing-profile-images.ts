import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase";

type CliOptions = {
  dryRun: boolean;
  limit?: number;
  userId?: string;
};

type ParsedStoragePath = {
  bucket: string;
  objectPath: string;
};

type MigrationLog = {
  userId: string;
  oldUrl: string;
  newUrl: string;
  status: "updated" | "dry-run";
  notes?: string;
};

const MAX_DIMENSION = 512;
const WEBP_QUALITY = 78;

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = { dryRun: false };
  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.floor(value);
      }
      continue;
    }
    if (arg.startsWith("--user-id=")) {
      const value = arg.slice("--user-id=".length).trim();
      if (value) options.userId = value;
      continue;
    }
  }
  return options;
}

function parseSupabaseObjectUrl(rawUrl: string): ParsedStoragePath | null {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.endsWith(".supabase.co")) return null;
    const publicMarker = "/storage/v1/object/public/";
    const signMarker = "/storage/v1/object/sign/";
    const markerIndex = url.pathname.indexOf(publicMarker);
    const signIndex = url.pathname.indexOf(signMarker);
    if (markerIndex === -1 && signIndex === -1) return null;
    const rest =
      markerIndex !== -1
        ? url.pathname.slice(markerIndex + publicMarker.length)
        : url.pathname.slice(signIndex + signMarker.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    return {
      bucket: rest.slice(0, slash),
      objectPath: decodeURIComponent(rest.slice(slash + 1)),
    };
  } catch {
    return null;
  }
}

async function resolveDownloadUrl(rawUrl: string): Promise<string | null> {
  const parsed = parseSupabaseObjectUrl(rawUrl);
  if (!parsed) return rawUrl;
  const admin = getSupabaseAdminClient();
  if (!admin) return rawUrl;
  const signed = await admin.storage.from(parsed.bucket).createSignedUrl(parsed.objectPath, 60);
  if (signed.error || !signed.data?.signedUrl) return rawUrl;
  return signed.data.signedUrl;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;
  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

async function main() {
  loadEnvConfig(process.cwd());
  const options = parseArgs();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new Error("Missing Supabase admin credentials. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const bucket = process.env.SUPABASE_PROFILE_BUCKET || "profile-images";
  const where = options.userId ? { id: options.userId } : {};
  const users = await prisma.user.findMany({
    where,
    select: { id: true, profileImageUrl: true },
    orderBy: { createdAt: "desc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  const withImages = users.filter((u) => Boolean(u.profileImageUrl));
  console.log(`Scanned users: ${users.length}`);
  console.log(`Users with profile image: ${withImages.length}`);
  console.log(`Mode: ${options.dryRun ? "DRY RUN (no writes)" : "WRITE"}`);

  const logs: MigrationLog[] = [];
  let skipped = 0;
  let failed = 0;

  for (const user of withImages) {
    const oldUrl = user.profileImageUrl!;
    if (oldUrl.includes("/optimized/") || oldUrl.endsWith(".webp")) {
      skipped += 1;
      continue;
    }

    try {
      const downloadUrl = await resolveDownloadUrl(oldUrl);
      if (!downloadUrl) {
        failed += 1;
        logs.push({ userId: user.id, oldUrl, newUrl: "", status: options.dryRun ? "dry-run" : "updated", notes: "download_url_unresolved" });
        continue;
      }

      const original = await fetchImageBuffer(downloadUrl);
      if (!original) {
        failed += 1;
        logs.push({ userId: user.id, oldUrl, newUrl: "", status: options.dryRun ? "dry-run" : "updated", notes: "download_failed_or_not_image" });
        continue;
      }

      const optimized = await sharp(original)
        .rotate()
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer();

      const filePath = `profiles/optimized/profile-${Date.now()}-${user.id}-${randomUUID()}.webp`;
      const { data } = admin.storage.from(bucket).getPublicUrl(filePath);
      const newUrl = data.publicUrl || "";

      if (options.dryRun) {
        logs.push({ userId: user.id, oldUrl, newUrl, status: "dry-run" });
        continue;
      }

      const upload = await admin.storage.from(bucket).upload(filePath, optimized, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
      if (upload.error) {
        failed += 1;
        logs.push({ userId: user.id, oldUrl, newUrl, status: "updated", notes: `upload_failed:${upload.error.message}` });
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { profileImageUrl: newUrl },
      });
      logs.push({ userId: user.id, oldUrl, newUrl, status: "updated" });
    } catch (error) {
      failed += 1;
      logs.push({
        userId: user.id,
        oldUrl,
        newUrl: "",
        status: options.dryRun ? "dry-run" : "updated",
        notes: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  const outDir = path.join(process.cwd(), "scripts", "logs");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `profile-image-migration-${stamp}.json`);
  await writeFile(outPath, JSON.stringify({ options, totals: { users: users.length, withImages: withImages.length, skipped, failed, processed: logs.length }, logs }, null, 2), "utf8");

  console.log(`Processed entries: ${logs.length}`);
  console.log(`Skipped (already optimized): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Log file: ${outPath}`);
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
