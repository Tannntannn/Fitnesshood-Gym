import type { UserRole } from "@prisma/client";

type AttendanceGuardInput = {
  role: UserRole;
  freezeStatus?: string | null;
  freezeEndsAt?: Date | null;
  monthlyExpiryDate?: Date | null;
};

export function getAttendanceBlockReason(input: AttendanceGuardInput, now: Date): string | null {
  if (input.role !== "MEMBER") return null;

  const freezeStatus = (input.freezeStatus ?? "").trim().toUpperCase();
  if (freezeStatus === "ACTIVE" && (!input.freezeEndsAt || input.freezeEndsAt.getTime() >= now.getTime())) {
    return "Membership is currently frozen. Please contact admin before attendance scan.";
  }

  if (input.monthlyExpiryDate && input.monthlyExpiryDate.getTime() < now.getTime()) {
    return "Monthly fee is expired. Please settle payment with admin before attendance scan.";
  }

  return null;
}

