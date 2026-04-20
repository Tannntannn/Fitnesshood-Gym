import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 5 * 1024 * 1024;

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

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "Image must be 5MB or less." }, { status: 400 });
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
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const fileName = `profile-${Date.now()}-${randomUUID()}.${ext}`;
    const filePath = `profiles/${fileName}`;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, Buffer.from(bytes), {
      contentType: file.type,
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

