"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { BadgePercent, CircleUserRound, Dumbbell, Home, ShieldCheck, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type MemberUser = { id: string; firstName: string; lastName: string };

export default function ClientDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<MemberUser | null>(null);
  const [error, setError] = useState("");
  const aboutRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/client/me");
      const json = (await res.json()) as { success: true; data: { user: MemberUser } } | { success: false; error: string };

      if (!json.success) {
        if (res.status === 401) {
          router.replace("/client/login");
          return;
        }
        setError(json.error);
        return;
      }

      setUser(json.data.user);
    };

    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
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
    <div className="h-screen scroll-smooth overflow-y-auto snap-y snap-mandatory bg-[#0b1320] text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1320]/90 backdrop-blur">
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
                await fetch("/api/client/logout", { method: "POST" });
                router.replace("/client/login");
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
        <img src="/model%201.jpg" alt="About background 1" className="absolute inset-0 h-full w-full object-contain opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1320]/80 to-[#0b1320]/85" />
        <div className="mx-auto w-full max-w-6xl space-y-5">
          <div className="scroll-reveal delay-0 relative rounded-2xl border border-white/20 bg-black/45 p-5 text-center backdrop-blur-sm sm:p-8">
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
            <div className="scroll-reveal delay-1 relative rounded-xl border border-[#00d47d] bg-black/35 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <BadgePercent className="h-4 w-4 text-[#00d47d]" />
                Join Membership now! get 50% OFF
              </div>
            </div>
            <div className="scroll-reveal delay-2 relative rounded-xl border border-white/70 bg-black/35 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <UserCheck className="h-4 w-4 text-[#00d47d]" />
                Certified Trainer
              </div>
              <p className="mt-1 text-xs text-slate-200">You choose your coach. You control your progress.</p>
            </div>
            <div className="scroll-reveal delay-3 relative rounded-xl border border-[#00d47d] bg-black/35 p-4 text-sm">
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
        <img src="/model%202.jpg" alt="About background 2" className="absolute inset-0 h-full w-full object-contain opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1320]/80 to-[#0b1320]/85" />
        <div className="mx-auto w-full max-w-6xl">
          <Card className="scroll-reveal delay-0 relative surface-card bg-black/45 p-5 text-white ring-white/20 backdrop-blur-sm sm:p-8">
            <h2 className="text-5xl font-black leading-none text-[#00d47d] sm:text-6xl">About us.</h2>
            <p className="mt-4 max-w-3xl text-base text-slate-100 sm:text-xl">
              FitnessHood Gym is a results driven gym in your community. We focus on strength, discipline, and consistency.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/20 bg-black/30 p-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#00d47d]">What you get</p>
                <ul className="mt-2 space-y-1 text-base text-slate-100">
                  <li>- Complete strength and cardio equipment</li>
                  <li>- Clean and organized training space</li>
                  <li>- Flexible membership options</li>
                  <li>- Support for beginners and advanced lifters</li>
                  <li>- Student friendly rates</li>
                </ul>
              </div>
              <div className="rounded-xl border border-white/20 bg-black/30 p-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-[#00d47d]">Our goal</p>
                <p className="mt-2 text-base text-slate-100">Help you train better and stay consistent every single week.</p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section
        className="relative flex min-h-[calc(100vh-49px)] snap-start items-center overflow-hidden px-4 py-6 md:px-6"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/model%203%20man.jpg" alt="About background 3" className="absolute inset-0 h-full w-full object-contain opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1320]/80 to-[#0b1320]/85" />
        <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-2">
          <Card className="scroll-reveal delay-1 relative surface-card bg-black/45 p-5 text-white ring-white/20 backdrop-blur-sm sm:p-6">
            <h2 className="text-4xl font-black sm:text-5xl">
              <span className="text-[#00d47d]">MEMBERSHIP</span> OPTIONS
            </h2>
            <p className="mt-2 text-base text-slate-100">We offer memberships that fit your schedule and budget.</p>
            <div className="mt-4 space-y-2 text-base">
              <div className="rounded-lg bg-[#d4882f] p-3 font-semibold">BRONZE 1,200 - No Contract / No Membership Fee</div>
              <div className="rounded-lg bg-slate-200 p-3 font-semibold text-slate-900">SILVER 1,000 - 6 Months Contract</div>
              <div className="rounded-lg bg-[#d6b23f] p-3 font-semibold text-slate-900">GOLD 950 - 12 Months Contract</div>
            </div>
            <p className="mt-3 text-base">ADD ON: LOCKER / WIFI - PHP 100</p>
            <p className="mt-1 text-sm text-slate-200">CONTACT NO.: 09393987482</p>
          </Card>

          <Card className="scroll-reveal delay-2 relative surface-card bg-black/45 p-5 text-white ring-white/20 backdrop-blur-sm sm:p-6">
            <h2 className="text-4xl font-black sm:text-5xl">
              PERSONAL <span className="text-[#00d47d]">TRAINING</span> AND <span className="text-[#00d47d]">COACHING</span>
            </h2>
            <p className="mt-2 text-base text-slate-100">We provide you with the best service of being healthy.</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm font-bold">
              <div className="rounded-lg bg-[#d4882f] p-2">12 SESSIONS<br />PHP 4,200</div>
              <div className="rounded-lg bg-slate-200 p-2 text-slate-900">24 SESSIONS<br />PHP 8,400</div>
              <div className="rounded-lg bg-[#d6b23f] p-2 text-slate-900">30 SESSIONS<br />PHP 10,000</div>
            </div>
            <ul className="mt-4 space-y-1 text-base text-slate-100">
              <li>- Weight loss/gain</li>
              <li>- Body building</li>
              <li>- Body toning</li>
              <li>- Circuit Training/Tabata/HIIT</li>
              <li>- Strength and Conditioning</li>
              <li>- Nutrition advice</li>
              <li>- Weekly Check-ins</li>
            </ul>
            <p className="mt-4 flex items-center gap-2 text-base font-semibold"><ShieldCheck className="h-4 w-4 text-[#00d47d]" />CERTIFIED FHG COACH</p>
          </Card>
        </div>
      </section>

    </div>
  );
}

