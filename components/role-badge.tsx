import { UserRole } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { roleLabels } from "@/lib/role-labels";

const roleStyles: Record<UserRole, string> = {
  MEMBER: "bg-[#1e3a5f] text-white border border-white/10",
  NON_MEMBER: "bg-amber-400 text-slate-900 border border-white/10",
  WALK_IN: "bg-[#f97316] text-white border border-white/10",
  WALK_IN_REGULAR: "bg-orange-700 text-white border border-white/10",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge className={roleStyles[role]}>{roleLabels[role]}</Badge>;
}
