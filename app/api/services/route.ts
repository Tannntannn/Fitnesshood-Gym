import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const searchParams = new URL(request.url).searchParams;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const services = await prisma.service.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ name: "asc" }, { tier: "asc" }],
    });
    return NextResponse.json({ success: true, data: services });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch services.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      name?: string;
      tier?: string;
      monthlyRate?: number;
      contractMonths?: number;
      accessCycleDays?: number;
      membershipFee?: number;
      contractPrice?: number;
      isActive?: boolean;
    };

    const name = body.name?.trim();
    const tier = body.tier?.trim();
    const monthlyRate = Number(body.monthlyRate ?? 0);
    const contractMonths = Math.max(0, Math.trunc(Number(body.contractMonths ?? 0)));
    const accessCycleDays = Math.max(1, Math.trunc(Number(body.accessCycleDays ?? 30)));
    const membershipFee = Number(body.membershipFee ?? 0);
    const contractPrice = Number(body.contractPrice ?? monthlyRate);

    if (!name || !tier) {
      return NextResponse.json({ success: false, error: "Service name and tier are required." }, { status: 400 });
    }
    if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) {
      return NextResponse.json({ success: false, error: "Price must be greater than zero." }, { status: 400 });
    }
    if (!Number.isFinite(membershipFee) || membershipFee < 0 || !Number.isFinite(contractPrice) || contractPrice < 0) {
      return NextResponse.json({ success: false, error: "Invalid pricing values." }, { status: 400 });
    }

    const created = await prisma.service.create({
      data: {
        name,
        tier,
        monthlyRate,
        contractMonths,
        accessCycleDays,
        membershipFee,
        contractPrice,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        { success: false, error: "Service with this name and tier already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to create service.", details: message },
      { status: 500 },
    );
  }
}
