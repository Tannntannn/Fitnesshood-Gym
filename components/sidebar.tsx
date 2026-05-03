"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Bell,
  ChevronDown,
  ClipboardList,
  Home,
  LogOut,
  Package,
  ShieldUser,
  UserPlus2,
  UserRoundCheck,
  Users,
  UsersRound,
  WalletCards,
  Wallet,
  Trophy,
  BarChart3,
  HandCoins,
  Receipt,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const coachLinks = [
  { href: "/coaches", label: "Coach roster", icon: ShieldUser },
  { href: "/coaches/remittances", label: "Remittance records", icon: Receipt },
];

const links = [
  { href: "/dashboard", label: "Dashboard & Scan", icon: Home },
  { href: "/register", label: "Register User", icon: UserPlus2 },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/services", label: "Services", icon: Package },
  { href: "/users", label: "All Users", icon: Users },
  { href: "/members-management", label: "Members Management", icon: WalletCards },
  { href: "/announcements", label: "Announcements", icon: Bell },
  { href: "/addons", label: "Add-ons", icon: HandCoins },
  { href: "/loyalty", label: "Loyalty Ledger", icon: Trophy },
  { href: "/reports", label: "Balance Reports", icon: BarChart3 },
];

const attendanceLinks = [
  { href: "/attendance/members", label: "Members Attendance", icon: UsersRound },
  { href: "/attendance/non-members", label: "Non-Members Attendance", icon: UserRoundCheck },
  { href: "/attendance/walk-in", label: "Walk-in (Student) Attendance", icon: ClipboardList },
  { href: "/attendance/walk-in-regular", label: "Walk-in (Regular) Attendance", icon: ClipboardList },
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const attendanceOpen = pathname.startsWith("/attendance");
  const coachesOpen = pathname.startsWith("/coaches");
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[1px] transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen w-[86vw] max-w-72 bg-[#0b1530] p-4 text-white shadow-2xl transition-transform duration-300 md:sticky md:top-0 md:z-20 md:h-screen md:w-64 md:max-w-none md:self-start md:translate-x-0 md:border-r md:border-slate-800/80 md:shadow-none",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col gap-4">
          <div className="border-b border-white/15 pb-3">
            <div className="mb-2 flex items-center justify-end md:hidden">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png?v=1"
                alt="FitnessHood logo"
                className="h-9 w-9 rounded-md bg-white/10 object-contain p-1"
              />
              <div>
                <p className="text-lg font-semibold tracking-tight">FitnessHood</p>
                <p className="text-[11px] text-slate-300">Gym Attendance System</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-hidden pr-1">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-200 transition-all duration-200 hover:bg-white/10 hover:text-white",
                    pathname === link.href && "bg-[#1e3a5f] text-white shadow-sm",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{link.label}</span>
                </Link>
              );
            })}

            <details open={coachesOpen} className="group rounded-lg bg-white/5">
              <summary
                className={cn(
                  "cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-slate-200 transition-all duration-200 hover:bg-white/10 hover:text-white",
                  coachesOpen && "bg-[#1e3a5f] text-white shadow-sm",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2.5">
                    <ShieldUser className="h-4 w-4 shrink-0" />
                    <span>Coaches</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-300 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="mt-1 max-h-56 space-y-1 overflow-y-auto pb-1 pr-1">
                {coachLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={onClose}
                      className={cn(
                        "ml-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition-all duration-200 hover:bg-white/10 hover:text-white",
                        pathname === link.href && "bg-[#1e3a5f] text-white shadow-sm",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </details>

            <details open={attendanceOpen} className="group rounded-lg bg-white/5">
              <summary
                className={cn(
                  "cursor-pointer list-none rounded-lg px-3 py-2 text-sm text-slate-200 transition-all duration-200 hover:bg-white/10 hover:text-white",
                  attendanceOpen && "bg-[#1e3a5f] text-white shadow-sm",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2.5">
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    <span>Attendance Records</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-300 transition-transform group-open:rotate-180" />
                </div>
              </summary>

              <div className="mt-1 max-h-56 space-y-1 overflow-y-auto pb-1 pr-1">
                {attendanceLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={onClose}
                      className={cn(
                        "ml-2 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition-all duration-200 hover:bg-white/10 hover:text-white",
                        pathname === link.href && "bg-[#1e3a5f] text-white shadow-sm",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </details>
          </nav>
          <Button
            className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 transition-all duration-200"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>
    </>
  );
}
