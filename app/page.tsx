import Link from "next/link";
import { LandingAboutSection } from "@/components/landing-about-section";

export default function Home() {
  return (
    <main
      className="min-h-screen text-white"
      style={{
        backgroundImage: "linear-gradient(to bottom, rgba(11,19,32,0.72), rgba(11,19,32,0.78)), url('/landing%20image.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-4 py-6 sm:px-6 md:py-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png?v=1" alt="FitnessHood logo" className="h-10 w-10 rounded-lg bg-white/10 p-1 object-contain" />
            <div>
              <p className="text-lg font-semibold tracking-tight">FitnessHood</p>
              <p className="text-xs text-slate-200">Gym Attendance System</p>
            </div>
          </div>
          <a
            href="#about"
            className="text-xs font-medium text-[#00d47d] underline-offset-4 hover:underline sm:text-sm"
          >
            About & offers
          </a>
        </header>

        <section className="max-w-3xl py-10">
          <p className="text-4xl font-extrabold leading-[0.98] tracking-tight sm:text-6xl">
            Train with <span className="text-[#00d47d]">purpose.</span> Build real <span className="text-[#00d47d]">results.</span>
          </p>
          <p className="mt-4 max-w-2xl text-sm text-slate-100 sm:text-base">
            FitnessHood is built for serious training and smooth attendance tracking. Login as admin to manage members
            or activate your personal account to access your QR and profile.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-lg bg-[#00d47d] px-4 text-sm font-semibold text-[#0b1320] transition hover:bg-[#00d47d]/90"
            >
              Admin Login
            </Link>
            <Link
              href="/client/login"
              className="inline-flex h-10 items-center rounded-lg border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Member Access
            </Link>
          </div>
        </section>

        <LandingAboutSection />

        <footer className="text-xs text-slate-300">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-white/90">@fitnesshoodgym</p>
            <a
              href="https://www.instagram.com/fitnesshoodgym"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-black/45 text-white shadow-lg shadow-black/30 transition hover:scale-105 hover:bg-black/60"
              aria-label="FitnessHood Instagram"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5a4.25 4.25 0 0 0 4.25 4.25h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5a4.25 4.25 0 0 0-4.25-4.25h-8.5Zm8.88 2.13a1.12 1.12 0 1 1 0 2.24 1.12 1.12 0 0 1 0-2.24ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
              </svg>
            </a>
            <a
              href="https://www.facebook.com/FitnesshoodCandelaria?mibextid=wwXIfr&rdid=msxf8y3dtxoXBEjM&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1DgoxCk7QZ%2F%3Fmibextid%3DwwXIfr#"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-[#1877F2] text-white shadow-lg shadow-black/30 transition hover:scale-105 hover:bg-[#166fe0]"
              aria-label="FitnessHood Facebook"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.3-1.6 1.6-1.6h1.7V4.8c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.4V11H8v3h2.6v8h2.9Z" />
              </svg>
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
