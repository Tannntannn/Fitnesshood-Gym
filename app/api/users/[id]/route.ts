import { MembershipLifecycleStatus, UserRole } from "@prisma/client";
import { addDays, isAfter } from "date-fns";
import bcrypt from "bcryptjs";
import { prisma, PRISMA_INTERACTIVE_TX_OPTIONS } from "@/lib/prisma";
import { membershipPenaltySyncFromRules, syncMembershipPenaltyInTx } from "@/lib/membership-penalty";
import { nowInPH } from "@/lib/time";
import { jsonNoStore } from "@/lib/http";
import { requireAdminSession } from "@/lib/admin-auth";
import { recomputeMemberLockInFields, safeSetUserLockInCycleAnchorAt } from "@/lib/lock-in-cycle";

type Params = { params: { id: string } };

export const dynamic = "force-dynamic";

function normalizeFreezeStatus(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim().toUpperCase();
  return next || null;
}

function isFreezeActive(status: string | null | undefined, freezeEndsAt: Date | null | undefined, now: Date): boolean {
  if ((status ?? "").trim().toUpperCase() !== "ACTIVE") return false;
  if (!freezeEndsAt) return true;
  return freezeEndsAt.getTime() >= now.getTime();
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });
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
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });
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
  const session = await requireAdminSession();
  if (!session) return jsonNoStore({ success: false, error: "Unauthorized" }, { status: 401 });
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
      membershipTierStart?: string | null;
      membershipTierExpiry?: string | null;
      membershipJoinedStart?: string | null;
      membershipJoinedExpiry?: string | null;
      memberPassword?: string;
      membershipTier?: string | null;
      lockInLabel?: string | null;
      monthlyFeeLabel?: string | null;
      membershipFeeLabel?: string | null;
      gracePeriodEnd?: string | null;
      freezeStatus?: string | null;
      freezeStartedAt?: string | null;
      freezeEndsAt?: string | null;
      freezeDaysTotal?: number | null;
      membershipNotes?: string | null;
      coachName?: string | null;
      membershipPenalty?: boolean;
      membershipPenaltyNotes?: string | null;
      membershipPenaltyUseAuto?: boolean;
      remainingMonths?: number | null;
      monthlyExpiryDate?: string | null;
      daysLeft?: number | null;
      membershipStatus?: MembershipLifecycleStatus | null;
      lockInCycleAnchorAt?: string | null;
    };

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id: params.id } });
      if (!existing) throw new Error("User not found");

      const now = nowInPH();
      const data: Record<string, unknown> = {};
      const nextFreezeStatus =
        body.freezeStatus !== undefined ? normalizeFreezeStatus(body.freezeStatus) : normalizeFreezeStatus(existing.freezeStatus);
      const nextFreezeEndsAt = body.freezeEndsAt !== undefined ? (body.freezeEndsAt ? new Date(body.freezeEndsAt) : null) : existing.freezeEndsAt;
      const currentlyFrozen = isFreezeActive(existing.freezeStatus, existing.freezeEndsAt, now);
      const willBeFrozen = isFreezeActive(nextFreezeStatus, nextFreezeEndsAt, now);

      if (typeof body.firstName === "string") data.firstName = body.firstName.trim().replace(/\s+/g, " ");
      if (typeof body.lastName === "string") data.lastName = body.lastName.trim().replace(/\s+/g, " ");
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
        if (currentlyFrozen) {
          throw new Error("FREEZE_BLOCK:Cannot update membership dates while freeze is active.");
        }
        if (body.membershipStart !== undefined) data.membershipStart = body.membershipStart ? new Date(body.membershipStart) : null;
        if (body.membershipExpiry !== undefined) data.membershipExpiry = body.membershipExpiry ? new Date(body.membershipExpiry) : null;
      }
      if (effectiveRole === "MEMBER") {
        if (body.membershipTierStart !== undefined) data.membershipTierStart = body.membershipTierStart ? new Date(body.membershipTierStart) : null;
        if (body.membershipTierExpiry !== undefined) data.membershipTierExpiry = body.membershipTierExpiry ? new Date(body.membershipTierExpiry) : null;
        if (body.membershipJoinedStart !== undefined) data.membershipJoinedStart = body.membershipJoinedStart ? new Date(body.membershipJoinedStart) : null;
        if (body.membershipJoinedExpiry !== undefined) data.membershipJoinedExpiry = body.membershipJoinedExpiry ? new Date(body.membershipJoinedExpiry) : null;
      }
      if (effectiveRole === "MEMBER") {
        if (body.membershipTier !== undefined) data.membershipTier = body.membershipTier ? body.membershipTier.trim() : null;
        if (body.lockInLabel !== undefined) data.lockInLabel = body.lockInLabel ? body.lockInLabel.trim() : null;
        if (body.monthlyFeeLabel !== undefined) data.monthlyFeeLabel = body.monthlyFeeLabel ? body.monthlyFeeLabel.trim() : null;
        if (body.membershipFeeLabel !== undefined) data.membershipFeeLabel = body.membershipFeeLabel ? body.membershipFeeLabel.trim() : null;
        if (body.gracePeriodEnd !== undefined) data.gracePeriodEnd = body.gracePeriodEnd ? new Date(body.gracePeriodEnd) : null;
        if (body.freezeStatus !== undefined) data.freezeStatus = normalizeFreezeStatus(body.freezeStatus);
        if (body.freezeStartedAt !== undefined) data.freezeStartedAt = body.freezeStartedAt ? new Date(body.freezeStartedAt) : null;
        if (body.freezeEndsAt !== undefined) data.freezeEndsAt = body.freezeEndsAt ? new Date(body.freezeEndsAt) : null;
        if (body.freezeDaysTotal !== undefined) {
          data.freezeDaysTotal =
            typeof body.freezeDaysTotal === "number" && Number.isFinite(body.freezeDaysTotal)
              ? Math.max(0, Math.trunc(body.freezeDaysTotal))
              : null;
        } else if (body.freezeStartedAt !== undefined || body.freezeEndsAt !== undefined) {
          const start = body.freezeStartedAt ? new Date(body.freezeStartedAt) : existing.freezeStartedAt;
          const end = body.freezeEndsAt ? new Date(body.freezeEndsAt) : existing.freezeEndsAt;
          if (start && end) {
            const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
            data.freezeDaysTotal = days;
          }
        }
        if (body.membershipNotes !== undefined) data.membershipNotes = body.membershipNotes ? body.membershipNotes.trim() : null;
      }
      if (typeof body.memberPassword === "string" && body.memberPassword.trim().length > 0) {
        data.memberPasswordHash = await bcrypt.hash(body.memberPassword.trim(), 10);
      }
      if (body.remainingMonths !== undefined && effectiveRole === "MEMBER") {
        data.remainingMonths =
          body.remainingMonths == null || !Number.isFinite(Number(body.remainingMonths))
            ? null
            : Math.max(0, Math.trunc(Number(body.remainingMonths)));
      }
      if (
        (body.monthlyExpiryDate !== undefined || body.daysLeft !== undefined || body.membershipStatus !== undefined) &&
        effectiveRole === "MEMBER"
      ) {
        if (currentlyFrozen) {
          throw new Error("FREEZE_BLOCK:Cannot update monthly access dates while freeze is active.");
        }
        if (body.monthlyExpiryDate !== undefined) {
          data.monthlyExpiryDate = body.monthlyExpiryDate ? new Date(body.monthlyExpiryDate) : null;
        }
        if (body.daysLeft !== undefined) {
          data.daysLeft =
            body.daysLeft == null || !Number.isFinite(Number(body.daysLeft))
              ? null
              : Math.trunc(Number(body.daysLeft));
        }
        if (body.membershipStatus !== undefined) {
          data.membershipStatus = body.membershipStatus;
        }
      }
      let lockInCycleAnchorPatch: Date | null | undefined = undefined;
      if (body.lockInCycleAnchorAt !== undefined && effectiveRole === "MEMBER") {
        lockInCycleAnchorPatch = body.lockInCycleAnchorAt ? new Date(body.lockInCycleAnchorAt) : null;
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
          data.membershipTierStart = now;
          data.membershipTierExpiry = addDays(now, 30);
          data.membershipJoinedStart = now;
          data.membershipJoinedExpiry = addDays(now, 365);
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
          data.freezeStartedAt = null;
          data.freezeEndsAt = null;
          data.freezeDaysTotal = null;
          data.membershipNotes = null;
          data.membershipTierStart = null;
          data.membershipTierExpiry = null;
          data.membershipJoinedStart = null;
          data.membershipJoinedExpiry = null;
        }
      }

      if (body.renewMembership && effectiveRole === "MEMBER") {
        if (currentlyFrozen) {
          throw new Error("FREEZE_BLOCK:Cannot renew membership while freeze is active.");
        }
        const renewDays = Number.isFinite(body.renewDays) ? Math.max(1, Math.floor(body.renewDays as number)) : 30;
        const base =
          existing.membershipExpiry && isAfter(existing.membershipExpiry, now) ? existing.membershipExpiry : now;
        data.membershipStart = existing.membershipStart ?? now;
        data.membershipExpiry = addDays(base, renewDays);
        data.membershipTierStart = now;
        data.membershipTierExpiry = addDays(now, renewDays);
      }

      const freezeEndedNow =
        effectiveRole === "MEMBER" &&
        (existing.freezeStatus ?? "").trim().toUpperCase() === "ACTIVE" &&
        !!existing.freezeEndsAt &&
        existing.freezeEndsAt.getTime() <= now.getTime() &&
        (existing.freezeDaysTotal ?? 0) > 0 &&
        !willBeFrozen;
      if (freezeEndedNow) {
        const freezeDays = Math.max(0, Math.trunc(existing.freezeDaysTotal ?? 0));
        if (freezeDays > 0) {
          const resolvedMembershipExpiry =
            (data.membershipExpiry as Date | null | undefined) ?? existing.membershipExpiry ?? null;
          const resolvedFullMembershipExpiry =
            (data.fullMembershipExpiry as Date | null | undefined) ?? existing.fullMembershipExpiry ?? null;
          const resolvedMonthlyExpiryDate =
            (data.monthlyExpiryDate as Date | null | undefined) ?? existing.monthlyExpiryDate ?? null;
          const resolvedGracePeriodEnd =
            (data.gracePeriodEnd as Date | null | undefined) ?? existing.gracePeriodEnd ?? null;
          if (resolvedMembershipExpiry) data.membershipExpiry = addDays(resolvedMembershipExpiry, freezeDays);
          if (resolvedFullMembershipExpiry) data.fullMembershipExpiry = addDays(resolvedFullMembershipExpiry, freezeDays);
          if (resolvedMonthlyExpiryDate) data.monthlyExpiryDate = addDays(resolvedMonthlyExpiryDate, freezeDays);
          if (resolvedGracePeriodEnd) data.gracePeriodEnd = addDays(resolvedGracePeriodEnd, freezeDays);
        }
        data.freezeStatus = body.freezeStatus !== undefined ? normalizeFreezeStatus(body.freezeStatus) : "COMPLETED";
        data.freezeStartedAt = null;
        data.freezeEndsAt = null;
        data.freezeDaysTotal = null;
      }

      let user = await tx.user.update({
        where: { id: params.id },
        data,
      });

      if (lockInCycleAnchorPatch !== undefined) {
        await safeSetUserLockInCycleAnchorAt(tx, params.id, lockInCycleAnchorPatch);
      }

      if (effectiveRole === "MEMBER") {
        const penaltyData: {
          membershipPenalty?: boolean;
          membershipPenaltySource?: "AUTO" | "MANUAL" | null;
          membershipPenaltyNotes?: string | null;
        } = {};
        if (body.membershipPenaltyUseAuto === true) {
          const next = membershipPenaltySyncFromRules(user);
          penaltyData.membershipPenalty = next.membershipPenalty;
          penaltyData.membershipPenaltySource = next.membershipPenaltySource;
        } else if (body.membershipPenalty !== undefined) {
          penaltyData.membershipPenalty = body.membershipPenalty;
          penaltyData.membershipPenaltySource = "MANUAL";
        }
        if (body.membershipPenaltyNotes !== undefined) {
          penaltyData.membershipPenaltyNotes = body.membershipPenaltyNotes ? body.membershipPenaltyNotes.trim() : null;
        }
        if (Object.keys(penaltyData).length > 0) {
          user = await tx.user.update({ where: { id: params.id }, data: penaltyData });
        }
      }

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

      if (effectiveRole === "MEMBER") {
        await syncMembershipPenaltyInTx(tx, params.id);
      }

      if (body.lockInCycleAnchorAt !== undefined && effectiveRole === "MEMBER") {
        await recomputeMemberLockInFields(tx, params.id);
      }

      const fresh = await tx.user.findUnique({ where: { id: params.id } });
      return fresh ?? user;
    }, PRISMA_INTERACTIVE_TX_OPTIONS);
    return jsonNoStore({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.startsWith("FREEZE_BLOCK:")) {
      return jsonNoStore({ success: false, error: message.replace("FREEZE_BLOCK:", "") }, { status: 409 });
    }
    return jsonNoStore(
      { success: false, error: "Failed to update user", details: message },
      { status: 500 },
    );
  }
}
