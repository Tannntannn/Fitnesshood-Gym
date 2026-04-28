"use client";

import { useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { UserRole } from "@prisma/client";
import { Card } from "@/components/ui/card";
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
  scannedAt: string;
  timeIn: string;
  date: string;
};

export default function ClientMemberDashboard({ params }: { params: { id: string } }) {
  const [user, setUser] = useState<MemberUser | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/client/${params.id}`);
      const json = (await res.json()) as
        | { success: true; data: { user: MemberUser; attendance: AttendanceRow[] } }
        | { success: false; error: string };
      if (!json.success) {
        setError(json.error);
        return;
      }
      setUser(json.data.user);
      setImageFailed(false);
      setAttendance(json.data.attendance);
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
    };
  }, [params.id]);

  const remainingDays = useMemo(() => {
    if (!user?.membershipExpiry) return null;
    return differenceInCalendarDays(new Date(user.membershipExpiry), new Date());
  }, [user?.membershipExpiry]);

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
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900">Member Dashboard</h1>
          <span className="text-xs md:text-sm text-slate-500">{format(new Date(), "MMMM d, yyyy hh:mm a")}</span>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="surface-card p-5 lg:col-span-2">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="h-28 w-28 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                {user.profileImageUrl && !imageFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.profileImageUrl}
                    alt="Member profile"
                    className="h-full w-full object-cover"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <span className="text-3xl font-semibold text-slate-500">
                    {`${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">{user.firstName} {user.lastName}</h2>
                <p className="text-sm text-slate-600">{formatRoleLabel(user.role)}</p>
                <p className="text-sm text-slate-600">Contact: {user.contactNo || "N/A"}</p>
                <p className="text-sm text-slate-600">Email: {user.email || "N/A"}</p>
                <p className="text-sm text-slate-600">Address: {user.address || "N/A"}</p>
              </div>
            </div>
            {user.notes ? <p className="mt-4 text-sm text-slate-600">Notes: {user.notes}</p> : null}
          </Card>

          <Card className="surface-card p-5">
            <h3 className="text-sm font-semibold text-slate-700">Assigned QR</h3>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.qrCodeImage} alt="Assigned QR" className="w-full h-auto" />
            </div>
          </Card>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="surface-card p-4">
            <p className="text-xs text-slate-500">Membership Start</p>
            <p className="mt-1 font-semibold text-slate-900">
              {user.membershipStart ? format(new Date(user.membershipStart), "MMMM d, yyyy") : "N/A"}
            </p>
          </Card>
          <Card className="surface-card p-4">
            <p className="text-xs text-slate-500">Membership Expiry</p>
            <p className="mt-1 font-semibold text-slate-900">
              {user.membershipExpiry ? format(new Date(user.membershipExpiry), "MMMM d, yyyy") : "N/A"}
            </p>
          </Card>
          <Card className="surface-card p-4">
            <p className="text-xs text-slate-500">Remaining Days</p>
            <p className="mt-1 font-semibold text-slate-900">{remainingDays !== null ? `${remainingDays} day(s)` : "N/A"}</p>
          </Card>
        </div>

        <Card className="surface-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Recent Attendance</h3>
            <span className="text-xs text-slate-500">Latest 20 scans</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Time In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400">No attendance yet.</td>
                  </tr>
                ) : (
                  attendance.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3">{format(new Date(row.date), "MMMM d, yyyy")}</td>
                      <td className="px-4 py-3">{row.timeIn}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

