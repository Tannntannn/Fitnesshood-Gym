"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import { UserRole } from "@prisma/client";
import { CircleUserRound, Home, Megaphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientAnnouncementBanner } from "@/components/client-announcement-banner";
import { formatRoleLabel } from "@/lib/role-labels";
import { getMembershipStatus } from "@/lib/membership";
import { LOYALTY_VOIDED_ENTRY_REASON, parseLoyaltyVoidAdminReason } from "@/lib/loyalty-void";

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
  fullMembershipExpiry?: string | null;
  monthlyExpiryDate?: string | null;
  profileImageUrl: string | null;
  membershipTier?: string | null;
  lockInLabel?: string | null;
  monthsPaid?: number;
  remainingMonths?: number | null;
  totalContractPrice?: string | null;
  remainingBalance?: string | null;
  coachName?: string | null;
  freezeStatus?: string | null;
  freezeEndsAt?: string | null;
};

type AttendanceRow = {
  id: string;
  timeIn: string;
  date: string;
};

type PaymentRow = {
  id: string;
  amount: string;
  grossAmount?: string | null;
  discountPercent?: number | null;
  discountAmount?: string | null;
  discountType?: string;
  transactionType?: string;
  paymentMethod: string;
  collectionStatus: "FULLY_PAID" | "PARTIAL";
  paidAt: string;
  paymentReference?: string | null;
  splitPayments?: Array<{ method: string; reference?: string | null }>;
  service: { name: string; tier: string };
};

type ClientAnnouncement = {
  id: string;
  title: string;
  message: string;
  imageUrl?: string | null;
  updatedAt: string;
};

type LoyaltyRow = {
  id: string;
  points: number;
  pointsEarned?: number;
  pointsDeducted?: number;
  remainingBalance?: number | null;
  reason: string;
  reasonDetail?: string | null;
  transactionReference?: string | null;
  adminApproval?: string;
  amountBasis?: string | null;
  rewardUsed: boolean;
  notes?: string | null;
  createdAt: string;
};

function formatPaymentReference(row: PaymentRow): string {
  if (row.paymentMethod === "SPLIT" && row.splitPayments?.length) {
    return row.splitPayments
      .map((sp) => `${sp.method}${sp.reference ? ` (${sp.reference})` : ""}`)
      .join("; ");
  }
  if (row.paymentReference) return row.paymentReference;
  return "—";
}

export default function ClientInfoPage() {
  const router = useRouter();
  const [user, setUser] = useState<MemberUser | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [error, setError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [loyaltyRows, setLoyaltyRows] = useState<LoyaltyRow[]>([]);
  const [loyaltyPage, setLoyaltyPage] = useState(1);
  const [loyaltyHasNext, setLoyaltyHasNext] = useState(false);
  const [currentStars, setCurrentStars] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalUsed, setTotalUsed] = useState(0);
  const [announcement, setAnnouncement] = useState<ClientAnnouncement | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/client/me", { cache: "no-store" });
      const json = (await res.json()) as
        | {
            success: true;
            data: {
              user: MemberUser;
              attendance: AttendanceRow[];
              payments: PaymentRow[];
              announcement?: ClientAnnouncement | null;
            };
          }
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
      setPayments(json.data.payments ?? []);
      setAnnouncement(json.data.announcement ?? null);
    };

    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 120000);
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
    };
  }, [router]);

  useEffect(() => {
    const loadLoyalty = async () => {
      const res = await fetch(`/api/client/loyalty?page=${loyaltyPage}&limit=8`);
      const json = (await res.json()) as {
        success?: boolean;
        data?: LoyaltyRow[];
        summary?: { currentPoints?: number; currentStars?: number; totalEarned?: number; totalUsed?: number };
        meta?: { hasNextPage?: boolean };
      };
      if (!json.success) return;
      setCurrentStars(Number(json.summary?.currentPoints ?? json.summary?.currentStars ?? 0));
      setTotalEarned(Number(json.summary?.totalEarned ?? 0));
      setTotalUsed(Number(json.summary?.totalUsed ?? 0));
      if (loyaltyPage === 1) setLoyaltyRows(json.data ?? []);
      else setLoyaltyRows((prev) => [...prev, ...(json.data ?? [])]);
      setLoyaltyHasNext(Boolean(json.meta?.hasNextPage));
    };
    loadLoyalty();
  }, [loyaltyPage]);

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
  const membershipStatus = useMemo(() => getMembershipStatus(user?.membershipExpiry), [user?.membershipExpiry]);
  const latestMembershipPayment = useMemo(
    () =>
      payments.find(
        (row) =>
          row.service.name === "Membership" &&
          row.transactionType !== "MONTHLY_FEE" &&
          (row.transactionType === "MEMBERSHIP_CONTRACT" ||
            row.transactionType === "LEGACY" ||
            row.transactionType === undefined),
      ) ?? null,
    [payments],
  );

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
            <Button
              type="button"
              variant="outline"
              className="h-8 border-white/20 bg-white/10 px-3 text-xs text-white hover:bg-white/20"
              onClick={() => router.push("/client/news")}
            >
              <Megaphone className="mr-1.5 h-3.5 w-3.5" />
              Announcements
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
        <div className="relative z-10 mx-auto min-h-[calc(100vh-72px)] w-full max-w-6xl space-y-4 px-4 pb-8 pt-4 md:px-6">
          {announcement ? <ClientAnnouncementBanner announcement={announcement} variant="info" /> : null}
          <div className="grid gap-3 lg:grid-cols-5 lg:items-start">
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
                <p>Coach: {user.coachName || "Not assigned"}</p>
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
              <div className="mt-3 space-y-2">
                {membershipStatus === "EXPIRING_SOON" ? (
                  <div className="rounded-lg border border-amber-300/60 bg-amber-500/20 px-3 py-2 text-xs text-amber-100">
                    Membership expiring soon. Please renew this week to avoid interruption.
                  </div>
                ) : null}
                {membershipStatus === "EXPIRED" ? (
                  <div className="rounded-lg border border-red-300/60 bg-red-500/20 px-3 py-2 text-xs text-red-100">
                    Membership expired. Please contact the admin for renewal.
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-white/20 bg-black/30 p-2">
                    <p className="text-slate-300">Tier</p>
                    <p className="mt-1 font-semibold">{user.membershipTier || "Unassigned"}</p>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-black/30 p-2">
                    <p className="text-slate-300">Status</p>
                    <p className="mt-1 font-semibold">
                      {membershipStatus === "EXPIRING_SOON" ? "Expiring Soon" : membershipStatus === "EXPIRED" ? "Expired" : "Active"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-black/30 p-2">
                    <p className="text-slate-300">Lock-in</p>
                    <p className="mt-1 font-semibold">{user.lockInLabel || "N/A"}</p>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-black/30 p-2">
                    <p className="text-slate-300">Remaining</p>
                    <p className="mt-1 font-semibold">{remainingDays !== null ? `${remainingDays} days` : "N/A"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-white/20 bg-black/30 p-2">
                  <p className="text-slate-300">Start</p>
                  <p className="mt-1 font-semibold">{user.membershipStart ? format(new Date(user.membershipStart), "MMM d, yyyy") : "N/A"}</p>
                </div>
                <div className="rounded-lg border border-white/20 bg-black/30 p-2">
                  <p className="text-slate-300">Contract end</p>
                  <p className="mt-1 font-semibold">
                    {user.fullMembershipExpiry || user.membershipExpiry
                      ? format(new Date(user.fullMembershipExpiry ?? user.membershipExpiry ?? ""), "MMM d, yyyy")
                      : "N/A"}
                  </p>
                </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 p-2">
                    <p className="text-cyan-200">Monthly access until</p>
                    <p className="mt-1 font-semibold text-cyan-50">
                      {user.monthlyExpiryDate ? format(new Date(user.monthlyExpiryDate), "MMM d, yyyy") : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-violet-300/30 bg-violet-500/10 p-2">
                    <p className="text-violet-200">Freeze</p>
                    <p className="mt-1 font-semibold text-violet-50">
                      {user.freezeStatus || user.freezeEndsAt
                        ? `${user.freezeStatus ?? "Active"}${user.freezeEndsAt ? ` · ends ${format(new Date(user.freezeEndsAt), "MMM d, yyyy")}` : ""}`
                        : "None"}
                    </p>
                  </div>
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

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Payments and Billing</h3>
                <span className="text-xs text-slate-300">Latest 20 payments</span>
              </div>
              {user.role === "MEMBER" ? (
                <div className="mb-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-white/20 bg-black/30 p-2 text-center">
                    <p className="text-slate-300">Months Paid</p>
                    <p className="mt-1 font-semibold">{user.monthsPaid ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-black/30 p-2 text-center">
                    <p className="text-slate-300">Remaining Months</p>
                    <p className="mt-1 font-semibold">{user.remainingMonths ?? "N/A"}</p>
                  </div>
                  <div className="rounded-lg border border-white/20 bg-black/30 p-2 text-center">
                    <p className="text-slate-300">Contract Price</p>
                    <p className="mt-1 font-semibold">{Number(user.totalContractPrice ?? 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-red-300/40 bg-red-500/15 p-2 text-center">
                    <p className="text-red-200">Pending Balance</p>
                    <p className="mt-1 font-semibold text-red-100">{Number(user.remainingBalance ?? 0).toFixed(2)}</p>
                  </div>
                </div>
              ) : null}
              {user.role === "MEMBER" ? (
                <div className="mb-2 rounded-lg border border-amber-300/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-100">
                  <p className="font-semibold">Membership Billing Status</p>
                  <p>Remaining Balance: {Number(user.remainingBalance ?? 0).toFixed(2)}</p>
                  <p>
                    Latest Membership Payment:{" "}
                    {latestMembershipPayment
                      ? latestMembershipPayment.collectionStatus === "PARTIAL"
                        ? "Partial"
                        : "Fully Paid"
                      : "No membership payment yet"}
                  </p>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-xl border border-white/20 bg-black/25">
                <table className="w-full text-sm">
                  <thead className="bg-black/35 text-slate-200">
                    <tr className="text-left">
                      <th className="px-4 py-2.5 font-semibold">Date</th>
                      <th className="px-4 py-2.5 font-semibold">Service</th>
                      <th className="px-4 py-2.5 font-semibold">Method</th>
                      <th className="px-4 py-2.5 font-semibold">Reference</th>
                      <th className="px-4 py-2.5 font-semibold">Discount</th>
                      <th className="px-4 py-2.5 font-semibold">Payment Status</th>
                      <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-300">No payment records yet.</td>
                      </tr>
                    ) : (
                      payments.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-2.5">{format(new Date(row.paidAt), "MMMM d, yyyy hh:mm a")}</td>
                          <td className="px-4 py-2.5">{row.service.name} - {row.service.tier}</td>
                          <td className="px-4 py-2.5">{row.paymentMethod}</td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-slate-300 whitespace-pre-wrap break-all">
                            {formatPaymentReference(row)}
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-slate-300">
                            {row.discountType === "FIXED" && Number(row.discountAmount ?? 0) > 0
                              ? `Fixed ₱${Number(row.discountAmount).toFixed(2)}`
                              : Number(row.discountPercent ?? 0) > 0
                                ? `${Number(row.discountPercent)}% (${Number(row.discountAmount ?? 0).toFixed(2)})`
                                : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {row.service.name === "Membership" ? (
                              row.transactionType === "MONTHLY_FEE" ? (
                                <span className="rounded border border-cyan-300/50 bg-cyan-500/20 px-2 py-1 text-[11px] font-medium text-cyan-100">
                                  Monthly fee
                                </span>
                              ) : (
                                <span
                                  className={`rounded px-2 py-1 text-[11px] font-medium ${
                                    row.collectionStatus === "PARTIAL"
                                      ? "border border-amber-300/50 bg-amber-500/20 text-amber-100"
                                      : "border border-emerald-300/50 bg-emerald-500/20 text-emerald-100"
                                  }`}
                                >
                                  {row.collectionStatus === "PARTIAL" ? "Partial" : "Fully Paid"}
                                </span>
                              )
                            ) : (
                              <span className="text-slate-300">N/A</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {Number(row.amount).toFixed(2)}
                            {(Number(row.discountPercent ?? 0) > 0 || Number(row.discountAmount ?? 0) > 0) ? (
                              <p className="text-[10px] text-slate-400">
                                from {Number(row.grossAmount ?? row.amount).toFixed(2)}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Loyalty History</h3>
                <span className="text-xs text-emerald-300">
                  Current points: {currentStars} | Total earned: {totalEarned} | Total used: {totalUsed}
                </span>
              </div>
              <div className="space-y-2 rounded-xl border border-white/20 bg-black/25 p-3">
                {loyaltyRows.length === 0 ? (
                  <p className="text-xs text-slate-300">No loyalty activity yet.</p>
                ) : (
                  loyaltyRows.map((row) => {
                    const voided = row.reason === LOYALTY_VOIDED_ENTRY_REASON;
                    const voidNote = parseLoyaltyVoidAdminReason(row.notes);
                    return (
                    <div
                      key={row.id}
                      className={`rounded-lg border border-white/10 bg-black/20 p-2 text-xs ${
                        voided ? "opacity-60" : ""
                      }`}
                    >
                      <p>
                        <span
                          className={`${
                            voided
                              ? "text-slate-400 line-through"
                              : row.points >= 0
                                ? "text-emerald-300"
                                : "text-red-300"
                          }`}
                        >
                          {row.points >= 0 ? "+" : ""}
                          {row.points}
                        </span>{" "}
                        {row.reason}
                        {voided ? (
                          <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                            Voided
                          </span>
                        ) : null}
                      </p>
                      {voidNote ? <p className="mt-1 text-[10px] text-amber-200/90">Reason: {voidNote}</p> : null}
                      <p className="text-slate-400">
                        Ref: {row.transactionReference ?? "—"} | Earned: {row.pointsEarned ?? 0} | Deducted: {row.pointsDeducted ?? 0} | Remaining:{" "}
                        {row.remainingBalance ?? "—"}
                      </p>
                      <p className="text-slate-400">{new Date(row.createdAt).toLocaleString()}</p>
                      {row.notes ? <p className="text-slate-300">{row.notes}</p> : null}
                    </div>
                    );
                  })
                )}
                {loyaltyHasNext ? (
                  <Button
                    variant="outline"
                    className="mt-1 border-white/20 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => setLoyaltyPage((prev) => prev + 1)}
                  >
                    Load more
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

