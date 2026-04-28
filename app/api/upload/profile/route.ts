import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import sharp from "sharp";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_SIZE = 2 * 1024 * 1024;
const MAX_DIMENSION = 512;
const WEBP_QUALITY = 78;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file uploaded." }, { status: 400 });
    }

    if (!ALLOWED.has(file.type)) {
      return NextResponse.json({ success: false, error: "Only JPG, PNG, and WEBP are allowed." }, { status: 400 });
    }

    if (file.size > MAX_SOURCE_SIZE) {
      return NextResponse.json({ success: false, error: "Image must be 2MB or less." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: "Storage is not configured. Missing Supabase server credentials." },
        { status: 500 },
      );
    }

    const bucket = process.env.SUPABASE_PROFILE_BUCKET || "profile-images";
    const fileName = `profile-${Date.now()}-${randomUUID()}.webp`;
    const filePath = `profiles/${fileName}`;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const bytes = await file.arrayBuffer();
    const optimizedBuffer = await sharp(Buffer.from(bytes))
      .rotate()
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();

    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, optimizedBuffer, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ success: false, error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    if (!data.publicUrl) {
      return NextResponse.json({ success: false, error: "Upload succeeded but URL generation failed." }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: data.publicUrl });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to upload image.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

