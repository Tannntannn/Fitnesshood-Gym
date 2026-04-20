import type { UserRole } from "@prisma/client";

export const roleLabels: Record<UserRole, string> = {
  MEMBER: "Member",
  NON_MEMBER: "Non-Member",
  WALK_IN: "Walk-in (Student)",
  WALK_IN_REGULAR: "Walk-in (Regular)",
};

export function formatRoleLabel(role: UserRole): string {
  return roleLabels[role];
}
