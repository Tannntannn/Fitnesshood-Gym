import { UserRole } from "@prisma/client";
import { addDays, isAfter } from "date-fns";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { nowInPH } from "@/lib/time";
import { jsonNoStore } from "@/lib/http";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

export async function DELETE(_: Request, { params }: Params) {
  try {
    await prisma.user.delete({ where: { id: params.id } });
    return jsonNoStore({ success: true, data: { id: params.id } });
  } catch (error) {
    return jsonNoStore(
      { success: false, error: "Failed to delete user", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function GET(_: Request, { params }: Params) {
  try {
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) return jsonNoStore({ success: false, error: "User not found" }, { status: 404 });
    return jsonNoStore({ success: true, data: user });
  } catch (error) {
    return jsonNoStore(
      { success: false, error: "Failed to fetch user", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const body = (await request.json()) as {
      role?: UserRole;
      firstName?: string;
      lastName?: string;
      contactNo?: string;
      email?: string | null;
      address?: string | null;
      notes?: string | null;
      profileImageUrl?: string | null;
      renewMembership?: boolean;
      renewDays?: number;
      membershipStart?: string | null;
      membershipExpiry?: string | null;
      memberPassword?: string;
      membershipTier?: string | null;
      lockInLabel?: string | null;
      monthlyFeeLabel?: string | null;
      membershipFeeLabel?: string | null;
      gracePeriodEnd?: string | null;
      freezeStatus?: string | null;
      membershipNotes?: string | null;
      coachName?: string | null;
    };

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id: params.id } });
      if (!existing) throw new Error("User not found");

      const now = nowInPH();
      const data: Record<string, unknown> = {};

      if (typeof body.firstName === "string") data.firstName = body.firstName;
      if (typeof body.lastName === "string") data.lastName = body.lastName;
      if (typeof body.contactNo === "string") data.contactNo = body.contactNo;
      const effectiveRole = body.role ?? existing.role;
      if (body.email !== undefined) {
        const normalized = body.email ? body.email.trim().toLowerCase() : "";
        if (!normalized) throw new Error("Email is required.");
        if (normalized) {
          const existingEmail = await tx.user.findFirst({
            where: { email: normalized, id: { not: params.id } },
            select: { id: true },
          });
          if (existingEmail) throw new Error("Email is already registered.");
        }
        data.email = normalized || null;
      }
      if (body.address !== undefined) data.address = body.address ? body.address.trim() : null;
      if (body.notes !== undefined) data.notes = body.notes ? body.notes.trim() : null;
      if (body.profileImageUrl !== undefined) data.profileImageUrl = body.profileImageUrl ? body.profileImageUrl.trim() : null;
      if ((body.membershipStart !== undefined || body.membershipExpiry !== undefined) && effectiveRole === "MEMBER") {
        if (body.membershipStart !== undefined) data.membershipStart = body.membershipStart ? new Date(body.membershipStart) : null;
        if (body.membershipExpiry !== undefined) data.membershipExpiry = body.membershipExpiry ? new Date(body.membershipExpiry) : null;
      }
      if (effectiveRole === "MEMBER") {
        if (body.membershipTier !== undefined) data.membershipTier = body.membershipTier ? body.membershipTier.trim() : null;
        if (body.lockInLabel !== undefined) data.lockInLabel = body.lockInLabel ? body.lockInLabel.trim() : null;
        if (body.monthlyFeeLabel !== undefined) data.monthlyFeeLabel = body.monthlyFeeLabel ? body.monthlyFeeLabel.trim() : null;
        if (body.membershipFeeLabel !== undefined) data.membershipFeeLabel = body.membershipFeeLabel ? body.membershipFeeLabel.trim() : null;
        if (body.gracePeriodEnd !== undefined) data.gracePeriodEnd = body.gracePeriodEnd ? new Date(body.gracePeriodEnd) : null;
        if (body.freezeStatus !== undefined) data.freezeStatus = body.freezeStatus ? body.freezeStatus.trim() : null;
        if (body.membershipNotes !== undefined) data.membershipNotes = body.membershipNotes ? body.membershipNotes.trim() : null;
      }
      if (typeof body.memberPassword === "string" && body.memberPassword.trim().length > 0) {
        data.memberPasswordHash = await bcrypt.hash(body.memberPassword.trim(), 10);
      }

      let roleChangedTo: UserRole | null = null;
      if (body.role) {
        data.role = body.role;
        roleChangedTo = body.role;

        // Enforce email requirement on role change.
        if (!((data.email as string | null | undefined) ?? existing.email)) {
          throw new Error("Email is required.");
        }

        if (body.role === "MEMBER" && !existing.membershipStart) {
          data.membershipStart = now;
          data.membershipExpiry = addDays(now, 30);
        }

        // Non-members and walk-ins should not carry membership dates.
        if (body.role !== "MEMBER") {
          data.membershipStart = null;
          data.membershipExpiry = null;
          data.membershipTier = null;
          data.lockInLabel = null;
          data.monthlyFeeLabel = null;
          data.membershipFeeLabel = null;
          data.gracePeriodEnd = null;
          data.freezeStatus = null;
          data.membershipNotes = null;
        }
      }

      if (body.renewMembership && effectiveRole === "MEMBER") {
        const renewDays = Number.isFinite(body.renewDays) ? Math.max(1, Math.floor(body.renewDays as number)) : 30;
        const base =
          existing.membershipExpiry && isAfter(existing.membershipExpiry, now) ? existing.membershipExpiry : now;
        data.membershipStart = existing.membershipStart ?? now;
        data.membershipExpiry = addDays(base, renewDays);
      }

      const user = await tx.user.update({
        where: { id: params.id },
        data,
      });

      if (body.coachName !== undefined) {
        await tx.$executeRaw`
          UPDATE "User"
          SET "coachName" = ${body.coachName ? body.coachName.trim() : null}
          WHERE "id" = ${params.id}
        `;
      }

      if (body.membershipTier !== undefined && effectiveRole === "MEMBER") {
        const tierVal = body.membershipTier ? body.membershipTier.trim() : null;
        await tx.$executeRaw`
          UPDATE "User"
          SET "membershipTier" = ${tierVal}
          WHERE "id" = ${params.id}
        `;
      }

      // Keep attendance categories in sync when admin updates role.
      if (roleChangedTo) {
        await tx.attendance.updateMany({
          where: { userId: params.id },
          data: { roleSnapshot: roleChangedTo },
        });
      }

      const fresh = await tx.user.findUnique({ where: { id: params.id } });
      return fresh ?? user;
    });
    return jsonNoStore({ success: true, data: updated });
  } catch (error) {
    return jsonNoStore(
      { success: false, error: "Failed to update user", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
