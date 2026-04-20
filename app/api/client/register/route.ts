import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    void request;
    return NextResponse.json(
      { success: false, error: "Self-registration is disabled. Ask admin to register your email first." },
      { status: 403 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Request failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

