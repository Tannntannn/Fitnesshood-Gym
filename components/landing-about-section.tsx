import type { ReactNode } from "react";

/** Full gym offers + rules for the public home page only (`/#about`). */

function OfferCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent: "emerald" | "violet" | "amber" | "sky" | "rose";
  children: ReactNode;
}) {
  const border =
    accent === "emerald"
      ? "border-emerald-300/35 bg-emerald-900/20"
      : accent === "violet"
        ? "border-violet-300/35 bg-violet-900/20"
        : accent === "amber"
          ? "border-amber-300/35 bg-amber-900/20"
          : accent === "sky"
            ? "border-sky-300/35 bg-sky-900/20"
            : "border-rose-300/35 bg-rose-900/20";

  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${border}`}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-2 text-xs text-slate-100 sm:text-sm">{children}</div>
    </div>
  );
}

export function LandingAboutSection() {
  return (
    <section id="about" className="scroll-mt-6 rounded-2xl border border-white/20 bg-black/35 p-4 backdrop-blur-sm sm:p-6">
      <h2 className="text-lg font-semibold text-[#00d47d] sm:text-xl">About FitnessHood</h2>
      <p className="mt-1 max-w-3xl text-xs text-slate-200 sm:text-sm">
        Everything we offer at a glance—membership options, coaching, add-ons, how the member portal works, and the house
        rules we train by.
      </p>

      <div className="mt-4 grid gap-3 sm:gap-4 lg:grid-cols-2">
        <OfferCard title="Membership tiers & contracts" accent="emerald">
          <ul className="list-inside list-disc space-y-1.5 marker:text-[#00d47d]">
            <li>Bronze, Silver, Gold, Platinum, and dedicated Student pricing.</li>
            <li>Contract lengths and lock-in labels (e.g. multi-month lock-in) are tracked with your profile.</li>
            <li>Monthly access windows and renewal dates visible in your member portal after activation.</li>
            <li>Membership freeze options when you need a pause—subject to admin approval and gym policy.</li>
            <li>Upgrades, tier changes, and renewals are handled at the desk or through admin—ask any coach.</li>
          </ul>
        </OfferCard>

        <OfferCard title="Walk-ins, students & day access" accent="sky">
          <ul className="list-inside list-disc space-y-1.5 marker:text-[#00d47d]">
            <li>Student rates and day-visit options available at the front desk.</li>
            <li>Walk-in QR or pass flows where the gym has enabled them—check in with reception.</li>
            <li>First visit questions (health, waiver, orientation) are handled on site.</li>
          </ul>
        </OfferCard>

        <OfferCard title="Personal training & coaching" accent="violet">
          <ul className="list-inside list-disc space-y-1.5 marker:text-[#00d47d]">
            <li>One-on-one personal training tailored to your goals.</li>
            <li>Structured coaching for strength, conditioning, or sport-specific work.</li>
            <li>Coach assignment appears on your profile so you know who to reach out to.</li>
            <li>Program add-ons or package changes are coordinated through the gym team.</li>
          </ul>
        </OfferCard>

        <OfferCard title="Add-ons, loyalty & extras" accent="amber">
          <ul className="list-inside list-disc space-y-1.5 marker:text-[#00d47d]">
            <li>Optional add-ons such as locker rental, Wi-Fi access, and retail (e.g. pre-workout) where offered.</li>
            <li>Referral and loyalty-style perks when the gym runs those campaigns—stars or rewards show in your portal.</li>
            <li>Announcements for promos, schedule changes, and gym news are pushed to active members.</li>
          </ul>
        </OfferCard>

        <OfferCard title="Facility, equipment & attendance" accent="rose">
          <ul className="list-inside list-disc space-y-1.5 marker:text-[#00d47d]">
            <li>Full training floor access: cardio, free weights, racks, cables, and functional space.</li>
            <li>QR-based check-in for members keeps attendance accurate and fast at the door.</li>
            <li>Hygiene supplies on the floor—please wipe down gear before and after use (see rules below).</li>
            <li>Admin dashboard handles member records; your portal shows your QR, profile, and key dates.</li>
          </ul>
        </OfferCard>

        <OfferCard title="Member portal (this system)" accent="emerald">
          <ul className="list-inside list-disc space-y-1.5 marker:text-[#00d47d]">
            <li>Activate once with the email your admin registered, then sign in anytime.</li>
            <li>View your attendance QR, profile, payments summary, loyalty where enabled, and announcements.</li>
            <li>Update your profile photo from your account page when allowed.</li>
          </ul>
        </OfferCard>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-300/35 bg-cyan-900/20 p-3 sm:p-4">
        <p className="text-sm font-semibold text-white">Gym rules & etiquette</p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 text-xs text-slate-100 marker:text-cyan-300 sm:text-sm">
          <li>No horseplay, smoking, or vaping anywhere on the premises.</li>
          <li>Return plates, dumbbells, and attachments to their racks after use.</li>
          <li>Wipe and sanitize equipment before and after your sets.</li>
          <li>Wear proper training attire and closed athletic shoes—no slippers or flip-flops on the floor.</li>
          <li>Respect other members: share equipment between sets, re-rack your weight, and keep noise reasonable.</li>
          <li>Ask staff before filming other people or classes; be mindful of everyone&apos;s privacy.</li>
          <li>Follow coach and front-desk instructions for safety, capacity, and special events.</li>
        </ul>
      </div>
    </section>
  );
}
