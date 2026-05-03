import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { authOptions } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.admin?.id) {
    redirect("/login");
  }
  return <DashboardShell>{children}</DashboardShell>;
}
