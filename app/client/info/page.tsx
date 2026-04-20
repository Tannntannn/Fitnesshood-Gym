"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import { UserRole } from "@prisma/client";
import { CircleUserRound, Home } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRoleLabel } from "@/lib/role-labels";

type MemberUser = {
  id: string;
  firstName: string;
  lastName: string;
  contactNo: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  role: UserRole;
  qrCodeImage: string;
  membershipStart: string | null;
  membershipExpiry: string | null;
  profileImageUrl: string | null;
};

type AttendanceRow = {
  id: string;
  timeIn: string;
  date: string;
};

export default function ClientInfoPage() {
  const router = useRouter();
  const [user, setUser] = useState<MemberUser | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [error, setError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingImage, setSavingImage] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/client/me");
      const json = (await res.json()) as
        | { success: true; data: { user: MemberUser; attendance: AttendanceRow[] } }
        | { success: false; error: string };

      if (!json.success) {
        if (res.status === 401) {
          router.replace("/client/login");
          return;
        }
        setError(json.error);
        return;
      }

      setUser(json.data.user);
      setAttendance(json.data.attendance);
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

  const remainingDays = useMemo(() => {
    if (!user?.membershipExpiry) return null;
    return differenceInCalendarDays(new Date(user.membershipExpiry), new Date());
  }, [user?.membershipExpiry]);

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
        <Card className="surface-card p-6 text-center">
          <h1 className="text-lg font-semibold text-red-700">Unable to load info page</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
        <p className="text-sm text-slate-500">Loading member info...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1320] text-white">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b1320]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 md:px-6">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-8 border-white/20 bg-white/10 px-3 text-xs text-white hover:bg-white/20"
              onClick={() => router.push("/client/dashboard")}
            >
              <Home className="mr-1.5 h-3.5 w-3.5" />
              About
            </Button>
            <Button type="button" className="h-8 bg-[#00d47d] px-3 text-xs font-semibold text-[#0b1320] hover:bg-[#00d47d]/90">
              <CircleUserRound className="mr-1.5 h-3.5 w-3.5" />
              Personal Information
            </Button>
          </div>
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

      <section
        className="relative flex min-h-[calc(100vh-49px)] items-center overflow-hidden px-4 py-5 md:px-6"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing%20image.jpg" alt="Info background" className="absolute inset-0 h-full w-full object-contain opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1320]/80 to-[#0b1320]/85" />
        <div className="mx-auto grid min-h-[calc(100vh-72px)] w-full max-w-6xl content-start gap-3 pt-2 lg:grid-cols-5 lg:content-center">
          <Card className="scroll-reveal delay-1 surface-card bg-black/50 p-4 text-white ring-white/20 backdrop-blur-sm lg:col-span-2">
            <h3 className="text-xl font-bold tracking-tight">Gym Member Info</h3>
            <div className="mt-3 flex items-start gap-3">
              <div className="h-16 w-16 overflow-hidden rounded-xl border border-white/20 bg-black/30">
                {user.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.profileImageUrl} alt="Member profile" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-lg font-semibold">{`${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`}</div>
                )}
              </div>
              <div className="text-sm text-slate-100">
                <p className="text-base font-semibold">{user.firstName} {user.lastName}</p>
                <p className="text-[#00d47d]">{formatRoleLabel(user.role)}</p>
                <p>Email: {user.email || "N/A"}</p>
                <p>Contact: {user.contactNo || "N/A"}</p>
                <p className="text-xs text-slate-300">{format(new Date(), "MMM d, yyyy hh:mm a")}</p>
              </div>
            </div>
            {user.notes ? <p className="mt-3 text-xs text-slate-200">{user.notes}</p> : null}

            <div className="mt-3 rounded-xl border border-white/20 bg-black/30 p-3">
              <p className="text-xs font-semibold text-slate-200">Profile Photo</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="block w-full text-xs text-slate-200 file:mr-2 file:rounded-md file:border-0 file:bg-[#00d47d] file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-[#0b1320] hover:file:bg-[#00d47d]/90"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingImage(true);
                    try {
                      const formData = new FormData();
                      formData.append("file", file);
                      const uploadRes = await fetch("/api/upload/profile", { method: "POST", body: formData });
                      const uploadJson = (await uploadRes.json()) as { success: boolean; url?: string; error?: string };
                      if (!uploadJson.success || !uploadJson.url) {
                        setError(uploadJson.error ?? "Image upload failed.");
                        return;
                      }

                      setSavingImage(true);
                      const saveRes = await fetch("/api/client/me", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ profileImageUrl: uploadJson.url }),
                      });
                      const saveJson = (await saveRes.json()) as
                        | { success: true; data: MemberUser }
                        | { success: false; error: string };
                      if (!saveJson.success) {
                        setError(saveJson.error);
                        return;
                      }
                      setUser((prev) => (prev ? { ...prev, profileImageUrl: uploadJson.url ?? null } : prev));
                    } catch {
                      setError("Unable to update profile image.");
                    } finally {
                      setUploadingImage(false);
                      setSavingImage(false);
                      e.target.value = "";
                    }
                  }}
                />
              </div>
              {uploadingImage ? <p className="mt-1 text-[11px] text-slate-300">Uploading image...</p> : null}
              {savingImage ? <p className="mt-1 text-[11px] text-slate-300">Saving profile...</p> : null}
            </div>

            {user.role === "MEMBER" ? (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-white/20 bg-black/30 p-2">
                  <p className="text-slate-300">Start</p>
                  <p className="mt-1 font-semibold">{user.membershipStart ? format(new Date(user.membershipStart), "MMM d, yyyy") : "N/A"}</p>
                </div>
                <div className="rounded-lg border border-white/20 bg-black/30 p-2">
                  <p className="text-slate-300">Expiry</p>
                  <p className="mt-1 font-semibold">{user.membershipExpiry ? format(new Date(user.membershipExpiry), "MMM d, yyyy") : "N/A"}</p>
                </div>
                <div className="rounded-lg border border-white/20 bg-black/30 p-2">
                  <p className="text-slate-300">Remaining</p>
                  <p className="mt-1 font-semibold">{remainingDays !== null ? `${remainingDays} days` : "N/A"}</p>
                </div>
              </div>
            ) : null}
          </Card>

          <Card className="scroll-reveal delay-2 surface-card bg-black/50 p-4 text-white ring-white/20 backdrop-blur-sm lg:col-span-3">
            <p className="text-xs font-semibold text-slate-200">YOUR QR FOR ATTENDANCE</p>
            <div className="mt-2 rounded-lg bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.qrCodeImage} alt="Assigned QR" className="mx-auto h-auto w-full max-w-[260px]" />
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent Attendance</h3>
                <span className="text-xs text-slate-300">Latest 20 scans</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/20 bg-black/25">
                <table className="w-full text-sm">
                  <thead className="bg-black/35 text-slate-200">
                    <tr className="text-left">
                      <th className="px-4 py-2.5 font-semibold">Date</th>
                      <th className="px-4 py-2.5 font-semibold">Time In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {attendance.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate-300">No attendance yet.</td>
                      </tr>
                    ) : (
                      attendance.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-2.5">{format(new Date(row.date), "MMMM d, yyyy")}</td>
                          <td className="px-4 py-2.5">{row.timeIn}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

