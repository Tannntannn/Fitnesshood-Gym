"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { format } from "date-fns";
import { BadgePercent, CircleUserRound, Dumbbell, Home, ShieldCheck, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type MemberUser = {
  id: string;
  firstName: string;
  lastName: string;
  membershipExpiry?: string | null;
  coachName?: string | null;
};

export default function ClientDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<MemberUser | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const aboutRef = useRef<HTMLElement | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/client/me");
        const json = (await res.json()) as { success: true; data: { user: MemberUser } } | { success: false; error: string };

        if (!json.success) {
          if (res.status === 401) {
            router.replace("/client/login");
            return;
          }
          setError(json.error);
          showNotice("error", json.error || "Failed to refresh dashboard.");
          return;
        }

        setUser(json.data.user);
      } catch {
        setError("Failed to refresh dashboard.");
        showNotice("error", "Failed to refresh dashboard.");
      }
    };

    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60000);
    const onFocus = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".scroll-reveal"));
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove("out-view");
            entry.target.classList.add("in-view");
          } else if (entry.target.classList.contains("in-view")) {
            entry.target.classList.remove("in-view");
            entry.target.classList.add("out-view");
          }
        });
      },
      { threshold: 0.2 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [user]);

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
        <Card className="surface-card p-6 text-center">
          <h1 className="text-lg font-semibold text-red-700">Unable to load dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
        <p className="text-sm text-slate-500">Loading member dashboard...</p>
      </div>
    );
  }

  return (
    <div className="h-screen scroll-smooth overflow-y-auto snap-y snap-mandatory bg-[#07101f] text-white">
      {notice ? (
        <div
          className={`fixed right-4 top-16 z-50 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg ${
            notice.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </div>
      ) : null}
      <div className="sticky top-0 z-30 border-b border-emerald-400/20 bg-[#07101f]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 md:px-6">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="h-8 bg-[#00d47d] px-3 text-xs font-semibold text-[#0b1320] hover:bg-[#00d47d]/90"
              onClick={() => aboutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <Home className="mr-1.5 h-3.5 w-3.5" />
              About
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-8 border-white/20 bg-white/10 px-3 text-xs text-white hover:bg-white/20"
              onClick={() => router.push("/client/info")}
            >
              <CircleUserRound className="mr-1.5 h-3.5 w-3.5" />
              Personal Information
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-300 sm:inline">{format(new Date(), "MMM d, yyyy hh:mm a")}</span>
            <Button
              variant="outline"
              className="h-8 border-white/20 bg-white/10 px-3 text-xs text-white hover:bg-white/20"
              onClick={async () => {
                try {
                  await fetch("/api/client/logout", { method: "POST" });
                  showNotice("success", "Logged out successfully.");
                  router.replace("/client/login");
                } catch {
                  showNotice("error", "Failed to logout. Please try again.");
                }
              }}
            >
              Logout
            </Button>
          </div>
        </div>
      </div>

      <section
        ref={aboutRef}
        className="relative flex min-h-[calc(100vh-49px)] snap-start items-center overflow-hidden px-4 py-6 md:px-6"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/model%201.jpg" alt="About background 1" className="absolute inset-0 h-full w-full object-contain opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050b16]/75 via-[#0a1630]/80 to-[#040912]/90" />
        <div className="mx-auto w-full max-w-6xl space-y-5">
          <div className="scroll-reveal delay-0 relative rounded-2xl border border-emerald-300/25 bg-slate-950/65 p-5 text-center shadow-xl shadow-emerald-950/20 backdrop-blur-sm sm:p-8">
            {user.membershipExpiry ? (
              <p className="mb-3 text-xs text-amber-200">
                {differenceInCalendarDays(new Date(user.membershipExpiry), new Date()) < 0
                  ? "Membership expired. Please contact admin for renewal."
                  : differenceInCalendarDays(new Date(user.membershipExpiry), new Date()) <= 7
                    ? "Membership expiring soon (within 7 days). Please renew early."
                    : `Membership active. Expiry: ${format(new Date(user.membershipExpiry), "MMM d, yyyy")}`}
              </p>
            ) : null}
            <p className="text-4xl font-extrabold leading-[0.98] tracking-tight sm:text-6xl md:text-7xl">
              Train with <span className="text-[#00d47d]">purpose.</span> Build real <span className="text-[#00d47d]">results.</span>
            </p>
            <p className="mx-auto mt-4 max-w-3xl text-base text-slate-200 sm:text-lg">
              FitnessHood Gym is built for people who take training seriously. You get quality equipment, flexible memberships,
              and a community that respects your goals.
            </p>
            <p className="mt-3 text-sm font-semibold text-[#00d47d]">@fitnesshoodgym</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="scroll-reveal delay-1 relative rounded-xl border border-emerald-400/40 bg-emerald-900/20 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <BadgePercent className="h-4 w-4 text-[#00d47d]" />
                Join Membership now! get 50% OFF
              </div>
            </div>
            <div className="scroll-reveal delay-2 relative rounded-xl border border-cyan-300/40 bg-cyan-900/20 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <UserCheck className="h-4 w-4 text-[#00d47d]" />
                Certified Trainer
              </div>
              <p className="mt-1 text-xs text-slate-200">
                {user.coachName ? `Assigned coach: ${user.coachName}` : "No coach assigned yet. Contact admin to set your coach."}
              </p>
            </div>
            <div className="scroll-reveal delay-3 relative rounded-xl border border-violet-300/40 bg-violet-900/20 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <Dumbbell className="h-4 w-4 text-[#00d47d]" />
                Quality Equipment
              </div>
              <p className="mt-1 text-xs text-slate-200">Free weights and machines</p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="relative flex min-h-[calc(100vh-49px)] snap-start items-center overflow-hidden px-4 py-6 md:px-6"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/model%202.jpg" alt="About background 2" className="absolute inset-0 h-full w-full object-contain opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050b16]/75 via-[#0a1630]/80 to-[#040912]/90" />
        <div className="mx-auto w-full max-w-6xl">
          <Card className="scroll-reveal delay-0 relative surface-card border border-cyan-300/20 bg-slate-950/65 p-5 text-white ring-white/20 shadow-2xl shadow-cyan-950/30 backdrop-blur-sm sm:p-8">
            <h2 className="text-4xl font-black leading-tight text-[#00d47d] sm:text-5xl">Membership Packages + Add-ons</h2>
            <p className="mt-3 max-w-4xl text-sm text-slate-100 sm:text-base">
              Membership fee and monthly rates cover gym access only. Coaching fees are separate and paid directly to your chosen
              coach.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="group relative rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-700/75 via-amber-600/65 to-amber-500/60 p-4 shadow-[0_14px_30px_rgba(120,53,15,0.45)] transition-all duration-300 hover:-translate-y-1 hover:rotate-[-0.6deg] hover:shadow-[0_20px_40px_rgba(120,53,15,0.55)]">
                <div className="pointer-events-none absolute inset-x-3 top-1 h-6 rounded-full bg-white/20 blur-md" />
                <p className="text-sm font-semibold uppercase tracking-wide text-[#00d47d]">Bronze (Flexible Access)</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-100">
                  <li>- No lock-in</li>
                  <li>- No long-term commitment</li>
                  <li>- Full gym access</li>
                  <li>- Ideal for short-term use / trial users</li>
                  <li>- PHP 1,200 monthly</li>
                </ul>
              </div>
              <div className="group relative rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-300/85 via-slate-400/75 to-slate-500/70 p-4 shadow-[0_14px_30px_rgba(51,65,85,0.45)] transition-all duration-300 hover:-translate-y-1 hover:rotate-[0.5deg] hover:shadow-[0_20px_40px_rgba(51,65,85,0.55)]">
                <div className="pointer-events-none absolute inset-x-3 top-1 h-6 rounded-full bg-white/25 blur-md" />
                <p className="text-sm font-semibold uppercase tracking-wide text-[#00d47d]">Silver (Starter Plan)</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-900">
                  <li>- 6 months lock-in</li>
                  <li>- Membership fee: PHP 800 (valid 1 year)</li>
                  <li>- Full gym access</li>
                  <li>- Best for starting a routine</li>
                  <li>- PHP 1,000 monthly</li>
                </ul>
              </div>
              <div className="group relative rounded-xl border border-yellow-300/70 bg-gradient-to-br from-yellow-500/85 via-yellow-400/75 to-yellow-300/70 p-4 shadow-[0_14px_30px_rgba(133,77,14,0.45)] transition-all duration-300 hover:-translate-y-1 hover:rotate-[-0.4deg] hover:shadow-[0_20px_40px_rgba(133,77,14,0.55)]">
                <div className="pointer-events-none absolute inset-x-3 top-1 h-6 rounded-full bg-white/25 blur-md" />
                <p className="text-sm font-semibold uppercase tracking-wide text-[#00d47d]">Gold (Most Popular)</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-900">
                  <li>- 9 months lock-in</li>
                  <li>- Membership fee: PHP 500 (valid 1 year)</li>
                  <li>- Full gym access + better savings</li>
                  <li>- 1 free visitor pass/month + discounted passes</li>
                  <li>- Eligible for referral discounts</li>
                  <li>- PHP 950 monthly</li>
                </ul>
              </div>
              <div className="group relative rounded-xl border border-cyan-300/70 bg-gradient-to-br from-cyan-600/80 via-blue-600/75 to-blue-500/70 p-4 shadow-[0_14px_30px_rgba(8,47,73,0.48)] transition-all duration-300 hover:-translate-y-1 hover:rotate-[0.5deg] hover:shadow-[0_20px_40px_rgba(8,47,73,0.58)]">
                <div className="pointer-events-none absolute inset-x-3 top-1 h-6 rounded-full bg-white/20 blur-md" />
                <p className="text-sm font-semibold uppercase tracking-wide text-[#00d47d]">Platinum (Best Value)</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-100">
                  <li>- 12 months lock-in</li>
                  <li>- Membership fee: PHP 500</li>
                  <li>- Referral discount eligible</li>
                  <li>- Discount on personal training</li>
                  <li>- Nutrition plan/progress assessment every 6 months</li>
                  <li>- Locker add-on at PHP 100 (from PHP 150)</li>
                  <li>- PHP 900 monthly</li>
                </ul>
              </div>
              <div className="group relative rounded-xl border border-violet-300/60 bg-gradient-to-br from-violet-700/75 via-violet-600/70 to-fuchsia-600/65 p-4 shadow-[0_14px_30px_rgba(76,29,149,0.5)] transition-all duration-300 hover:-translate-y-1 hover:rotate-[-0.5deg] hover:shadow-[0_20px_40px_rgba(76,29,149,0.6)]">
                <div className="pointer-events-none absolute inset-x-3 top-1 h-6 rounded-full bg-white/20 blur-md" />
                <p className="text-sm font-semibold uppercase tracking-wide text-[#00d47d]">Student + Walk-in</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-100">
                  <li>- Student plan: 3 months lock-in</li>
                  <li>- Membership fee: PHP 500 (valid 1 year)</li>
                  <li>- Full gym access (bring valid student ID)</li>
                  <li>- Student monthly rate: PHP 900</li>
                  <li>- One-day pass (student): PHP 100</li>
                  <li>- Regular day pass: PHP 150 (all-day entry)</li>
                </ul>
              </div>
              <div className="group relative rounded-xl border border-emerald-300/60 bg-gradient-to-br from-emerald-700/75 via-emerald-600/70 to-emerald-500/65 p-4 shadow-[0_14px_30px_rgba(6,78,59,0.5)] transition-all duration-300 hover:-translate-y-1 hover:rotate-[0.4deg] hover:shadow-[0_20px_40px_rgba(6,78,59,0.6)]">
                <div className="pointer-events-none absolute inset-x-3 top-1 h-6 rounded-full bg-white/20 blur-md" />
                <p className="text-sm font-semibold uppercase tracking-wide text-[#00d47d]">Add-ons, Rewards, and Hours</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-100">
                  <li>- Locker: PHP 150</li>
                  <li>- Wi-Fi: PHP 100</li>
                  <li>- Pre-workout: PHP 100</li>
                  <li>- Referral reward: PHP 100 off next renewal per signup</li>
                  <li>- Upgrade bonus in first 30 days: PHP 500 off membership</li>
                  <li>- We accept debit and credit card</li>
                  <li>- Mon-Thu 8:00 AM-10:00 PM, Fri 2:00 PM-10:00 PM, Sat-Sun 10:00 AM-10:00 PM</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section
        className="relative flex min-h-[calc(100vh-49px)] snap-start items-center overflow-hidden px-4 py-6 md:px-6"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/model%203%20man.jpg" alt="About background 3" className="absolute inset-0 h-full w-full object-contain opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050b16]/75 via-[#0a1630]/80 to-[#040912]/90" />
        <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-2">
          <Card className="scroll-reveal delay-1 relative surface-card border border-emerald-300/20 bg-slate-950/65 p-5 text-white ring-white/20 shadow-xl shadow-emerald-950/20 backdrop-blur-sm sm:p-6">
            <h2 className="text-4xl font-black sm:text-5xl">
              <span className="text-[#00d47d]">Personal Trainer</span> Package
            </h2>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-300/30 bg-emerald-900/20 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kots.png" alt="Coach Johapi Moner" className="h-20 w-20 rounded-lg border border-white/20 object-cover" />
              <p className="text-base text-slate-100">Coach: Johapi Moner - Certified Coach (since 2022)</p>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="rounded-lg bg-[#d4882f] p-3 font-semibold">Bronze (Guided): 2x/week (8 sessions) - PHP 3,500</div>
              <div className="rounded-lg bg-slate-200 p-3 font-semibold text-slate-900">Silver (Consistency): 3x/week (12 sessions) - PHP 6,000</div>
              <div className="rounded-lg bg-[#d6b23f] p-3 font-semibold text-slate-900">Gold (Transformation): 4x/week (16 sessions) - PHP 9,000</div>
              <div className="rounded-lg bg-emerald-300 p-3 font-semibold text-slate-900">Platinum (Elite): 5x/week (20 sessions) - PHP 12,000</div>
              <div className="rounded-lg bg-white/20 p-3 font-semibold">Elite Transformation (2 months, up to 40 sessions) - PHP 25,000</div>
            </div>
            <ul className="mt-4 space-y-1 text-sm text-slate-100">
              <li>- Includes personalized workout program, nutrition guidance</li>
              <li>- 1 consumable included: whey protein (small), creatine (basic), or pre-workout (limited)</li>
              <li>- Specialized in fat loss, strength building, and consistency</li>
            </ul>
          </Card>

          <Card className="scroll-reveal delay-2 relative surface-card border border-violet-300/20 bg-slate-950/65 p-5 text-white ring-white/20 shadow-xl shadow-violet-950/20 backdrop-blur-sm sm:p-6">
            <h2 className="text-4xl font-black sm:text-5xl">
              Gym Rules and <span className="text-[#00d47d]">Training Options</span>
            </h2>
            <ul className="mt-4 space-y-1 text-sm text-slate-100">
              <li>- No horseplaying</li>
              <li>- Hands off in the mirror</li>
              <li>- No vaping/smoking</li>
              <li>- No food in training area</li>
              <li>- Return plates/dumbbells after use</li>
              <li>- Minimize unnecessary dropping of heavy weights</li>
              <li>- Sanitize and wipe equipment before and after use</li>
              <li>- Be considerate and share equipment between sets</li>
              <li>- Proper gym attire required (no slippers/flipflops)</li>
              <li>- Shirt removal during training is discouraged</li>
            </ul>
            <p className="mt-3 text-sm font-semibold text-amber-300">Penalty: 1st warning, 2nd 7-day suspension, 3rd membership/plan canceled.</p>
            <div className="mt-4 rounded-xl border border-white/20 bg-black/30 p-3">
              <p className="text-sm font-semibold text-[#00d47d]">Special Training Options</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-100">
                <li>- Small Group Training (4-6 clients, 1 month): PHP 1,500/person</li>
                <li>- Online Training Plan: PHP 2,000/month</li>
                <li>- Nutrition Consultation: PHP 500</li>
                <li>- Meal Plan Customization: PHP 1,000</li>
              </ul>
            </div>
            <div className="mt-4 rounded-xl border border-white/20 bg-black/30 p-3">
              <p className="text-sm font-semibold text-[#00d47d]">Personal Training (1-on-1)</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-100">
                <li>- Bronze: PHP 1,500 monthly (workout program + basic guidance)</li>
                <li>- Silver: PHP 3,000 monthly (personalized program + weekly check-in + chat support)</li>
                <li>- Gold: PHP 5,000 monthly (full coaching + nutrition + progress tracking + priority support)</li>
              </ul>
            </div>
            <p className="mt-4 flex items-center gap-2 text-base font-semibold"><ShieldCheck className="h-4 w-4 text-[#00d47d]" />CERTIFIED FHG COACH</p>
            <p className="mt-2 text-xs text-slate-300">
              &quot;Results come from structure and consistency. I guide you every step.&quot;
            </p>
          </Card>
        </div>
      </section>

    </div>
  );
}

