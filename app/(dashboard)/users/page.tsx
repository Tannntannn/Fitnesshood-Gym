"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserRole } from "@prisma/client";
import { differenceInCalendarDays, format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/role-badge";
import { QrDisplay } from "@/components/qr-display";
import { formatRoleLabel } from "@/lib/role-labels";

type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  contactNo?: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  profileImageUrl?: string | null;
  membershipStart?: string | null;
  membershipExpiry?: string | null;
  membershipTier?: string | null;
  lockInLabel?: string | null;
  monthsPaid?: number;
  remainingMonths?: number | null;
  totalContractPrice?: string | null;
  remainingBalance?: string | null;
  coachName?: string | null;
  role: UserRole;
  qrCodeImage?: string;
  createdAt: string;
};
type PaymentRow = {
  id: string;
  amount: string;
  grossAmount?: string | null;
  discountPercent?: number | null;
  discountAmount?: string | null;
  paymentMethod: string;
  collectionStatus: "FULLY_PAID" | "PARTIAL";
  paidAt: string;
  paymentReference?: string | null;
  splitPayments?: Array<{ method: string; reference?: string | null }>;
  service: { name: string; tier: string };
};

function formatPaymentReference(row: PaymentRow): string {
  if (row.paymentMethod === "SPLIT" && row.splitPayments?.length) {
    return row.splitPayments
      .map((sp) => `${sp.method}${sp.reference ? ` (${sp.reference})` : ""}`)
      .join("; ");
  }
  return row.paymentReference || "—";
}

const roleSections: Array<{ role: UserRole; title: string; headerClass: string; badgeClass: string }> = [
  {
    role: "MEMBER",
    title: "Members",
    headerClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    badgeClass: "text-emerald-700",
  },
  {
    role: "NON_MEMBER",
    title: "Non-Members",
    headerClass: "bg-blue-50 text-blue-800 border-blue-200",
    badgeClass: "text-blue-700",
  },
  {
    role: "WALK_IN",
    title: "Walk-in (Student)",
    headerClass: "bg-amber-50 text-amber-800 border-amber-200",
    badgeClass: "text-amber-700",
  },
  {
    role: "WALK_IN_REGULAR",
    title: "Walk-in (Regular)",
    headerClass: "bg-purple-50 text-purple-800 border-purple-200",
    badgeClass: "text-purple-700",
  },
];

export default function UsersPage() {
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("ALL");
  const [selected, setSelected] = useState<(UserRow & { qrCodeImage: string }) | null>(null);
  const [clientPreviewUser, setClientPreviewUser] = useState<UserRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Record<string, UserRole>>({});
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [memberPassword, setMemberPassword] = useState("");
  const [renewDays, setRenewDays] = useState(30);
  const [savingProfile, setSavingProfile] = useState(false);
  const [userPayments, setUserPayments] = useState<PaymentRow[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showNotice = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  };

  const load = async () => {
    const usersRes = await fetch("/api/users?includeQr=false");
    const usersData = (await usersRes.json()) as { data: UserRow[] };
    const nextUsers = usersData.data ?? [];
    setUsers(nextUsers);
    setClientPreviewUser((prev) => {
      if (!prev) return null;
      return nextUsers.find((user) => user.id === prev.id) ?? null;
    });
    setEditingUser((prev) => {
      if (!prev) return null;
      return nextUsers.find((user) => user.id === prev.id) ?? null;
    });
  };

  useEffect(() => {
    load();

    const onFocus = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const filtered = useMemo(
    () =>
      users.filter((user) => {
        const name = `${user.firstName} ${user.lastName}`.toLowerCase();
        return name.includes(search.toLowerCase()) && (role === "ALL" || user.role === role);
      }),
    [users, search, role],
  );

  const groupedUsers = useMemo(() => {
    return roleSections.reduce<Record<UserRole, UserRow[]>>(
      (acc, section) => {
        acc[section.role] = filtered.filter((u) => u.role === section.role);
        return acc;
      },
      {
        MEMBER: [],
        NON_MEMBER: [],
        WALK_IN: [],
        WALK_IN_REGULAR: [],
      },
    );
  }, [filtered]);

  useEffect(() => {
    const loadPayments = async () => {
      if (!clientPreviewUser?.id) {
        setUserPayments([]);
        return;
      }
      setLoadingPayments(true);
      const res = await fetch(`/api/payments?userId=${clientPreviewUser.id}&limit=50`);
      const json = (await res.json()) as { success?: boolean; data?: PaymentRow[] };
      setUserPayments(json.success ? (json.data ?? []) : []);
      setLoadingPayments(false);
    };
    loadPayments();
    if (!clientPreviewUser?.id) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadPayments();
    }, 60000);
    const onFocus = () => loadPayments();
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadPayments();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clientPreviewUser?.id]);

  return (
    <Card className="surface-card space-y-5 p-5 lg:p-6">
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
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">All Users</h1>
          <p className="text-sm text-slate-500">Manage member profiles, QR codes, and role assignments.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 w-full lg:w-auto">
          <Input placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-64" />
          <Button
            variant="outline"
            className="border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            onClick={() => load()}
          >
            Refresh
          </Button>
          <select
            className="h-10 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="ALL">All roles</option>
            <option value="MEMBER">Member</option>
            <option value="NON_MEMBER">Non-Member</option>
            <option value="WALK_IN">Walk-in (Student)</option>
            <option value="WALK_IN_REGULAR">Walk-in (Regular)</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
        {roleSections.map((section) => {
          const rows = groupedUsers[section.role];
          return (
            <Card key={section.role} className="overflow-hidden border border-slate-200 bg-white">
              <div className={`border-b px-4 py-3 ${section.headerClass}`}>
                <p className="text-sm font-semibold">{section.title}</p>
                <p className={`text-xs ${section.badgeClass}`}>{rows.length} user(s)</p>
              </div>
              <div className="max-h-[560px] overflow-auto">
                <div className="space-y-2.5 p-2.5">
                  {rows.length === 0 ? (
                    <div className="px-3 py-8 text-center text-slate-500 text-xs rounded-xl border border-dashed border-slate-300 bg-slate-50">
                      No users in this group.
                    </div>
                  ) : (
                    rows.map((user, index) => (
                      <div key={user.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] text-slate-400">#{index + 1}</p>
                            <p className="font-semibold text-slate-800 leading-tight">{user.firstName} {user.lastName}</p>
                            <p className="text-[11px] text-slate-500">{user.address ?? "No address"}</p>
                            <p className="text-[11px] text-slate-500">Coach: {user.coachName || "Not assigned"}</p>
                          </div>
                          <RoleBadge role={user.role} />
                        </div>

                        <div className="mt-2">
                          <select
                            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-[11px] bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                            value={editingRole[user.id] ?? user.role}
                            onChange={(e) =>
                              setEditingRole((prev) => ({
                                ...prev,
                                [user.id]: e.target.value as UserRole,
                              }))
                            }
                          >
                            <option value="MEMBER">Member</option>
                            <option value="NON_MEMBER">Non-Member</option>
                            <option value="WALK_IN">Walk-in (Student)</option>
                            <option value="WALK_IN_REGULAR">Walk-in (Regular)</option>
                          </select>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 w-full px-2.5 text-[11px] bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 shadow-sm"
                            onClick={async () => {
                              const nextRole = editingRole[user.id] ?? user.role;
                              const res = await fetch(`/api/users/${user.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ role: nextRole }),
                              });
                              const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                              if (!json.success) {
                                showNotice("error", json.details || json.error || "Failed to update role.");
                                return;
                              }
                              await load();
                              showNotice("success", "User role updated.");
                            }}
                          >
                            Update
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-full px-2.5 text-[11px] border-slate-300 hover:bg-slate-100"
                            onClick={() => {
                              setEditingUser(user);
                              setMemberPassword("");
                              setRenewDays(30);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-full px-2.5 text-[11px] border-slate-300 hover:bg-slate-100"
                            onClick={() => setClientPreviewUser(user)}
                          >
                            Client
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-full px-2.5 text-[11px] border-slate-300 hover:bg-slate-100"
                            onClick={async () => {
                              const res = await fetch(`/api/users/${user.id}`);
                              const json = (await res.json()) as { success?: boolean; data?: UserRow; error?: string; details?: string };
                              if (!json.success || !json.data?.qrCodeImage) {
                                showNotice("error", json.details || json.error || "Failed to load QR code.");
                                return;
                              }
                              setSelected({
                                ...user,
                                qrCodeImage: json.data.qrCodeImage,
                              });
                            }}
                          >
                            QR
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 w-full px-2.5 text-[11px] shadow-sm col-span-2 border border-red-700/80 hover:border-red-800"
                            onClick={() => setPendingDeleteId(user.id)}
                          >
                            Delete
                          </Button>
                        </div>

                        <p className="mt-2 text-center text-[10px] text-slate-400">{format(new Date(user.createdAt), "MMM d, yyyy")}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {selected ? (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] grid place-items-center p-4 z-40">
          <Card className="p-5 max-w-md w-full surface-card shadow-xl fade-in-up">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">User QR Code</h3>
            <QrDisplay name={`${selected.firstName} ${selected.lastName}`} role={formatRoleLabel(selected.role)} qrCodeImage={selected.qrCodeImage} />
            <Button variant="outline" className="mt-4 w-full border-slate-300 hover:bg-slate-100" onClick={() => setSelected(null)}>
              Close
            </Button>
          </Card>
        </div>
      ) : null}

      {clientPreviewUser ? (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-[2px] grid place-items-center p-4 z-50">
          <Card className="w-full max-w-7xl h-[88vh] p-3 sm:p-4 surface-card shadow-xl fade-in-up flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Client View Preview</h3>
                <p className="text-xs sm:text-sm text-slate-500">
                  {clientPreviewUser.firstName} {clientPreviewUser.lastName}
                </p>
              </div>
              <Button
                variant="outline"
                className="border-slate-300 hover:bg-slate-100"
                onClick={() => setClientPreviewUser(null)}
              >
                Close
              </Button>
            </div>

            <div className="grid flex-1 gap-3 lg:grid-cols-[1.3fr_1fr]">
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                <iframe
                  src={`/client/${clientPreviewUser.id}`}
                  title="Client dashboard preview"
                  className="h-full w-full"
                />
              </div>
              <div className="space-y-3 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  <h4 className="text-sm font-semibold text-slate-900">Client Snapshot</h4>
                  <p className="mt-1">Name: {clientPreviewUser.firstName} {clientPreviewUser.lastName}</p>
                  <p>Coach: {clientPreviewUser.coachName || "Not assigned"}</p>
                  <p>Tier: {clientPreviewUser.membershipTier ?? "N/A"}</p>
                  <p>Lock-in: {clientPreviewUser.lockInLabel ?? "N/A"}</p>
                  <p>Months paid: {clientPreviewUser.monthsPaid ?? 0}</p>
                  <p>Remaining months: {clientPreviewUser.remainingMonths ?? "N/A"}</p>
                  <p>Contract price: {clientPreviewUser.totalContractPrice ?? "N/A"}</p>
                  <p>Balance: {clientPreviewUser.remainingBalance ?? "0.00"}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Payment History</h4>
                    <span className="text-[11px] text-slate-500">{userPayments.length} record(s)</span>
                  </div>
                  <div className="max-h-[380px] overflow-auto rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-100 text-slate-600">
                        <tr className="text-left">
                          <th className="px-2 py-1.5 font-semibold">Date</th>
                          <th className="px-2 py-1.5 font-semibold">Service</th>
                          <th className="px-2 py-1.5 font-semibold">Method</th>
                          <th className="px-2 py-1.5 font-semibold">Reference</th>
                          <th className="px-2 py-1.5 font-semibold">Discount</th>
                          <th className="px-2 py-1.5 font-semibold">Status</th>
                          <th className="px-2 py-1.5 font-semibold text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loadingPayments ? (
                          <tr>
                            <td colSpan={7} className="px-2 py-4 text-center text-slate-400">Loading payments...</td>
                          </tr>
                        ) : userPayments.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-2 py-4 text-center text-slate-400">No payment records yet.</td>
                          </tr>
                        ) : (
                          userPayments.map((row) => (
                            <tr key={row.id}>
                              <td className="px-2 py-1.5">{format(new Date(row.paidAt), "MMM d, yyyy hh:mm a")}</td>
                              <td className="px-2 py-1.5">{row.service.name} - {row.service.tier}</td>
                              <td className="px-2 py-1.5">{row.paymentMethod}</td>
                              <td className="max-w-[170px] px-2 py-1.5 font-mono text-[10px] text-slate-600 whitespace-pre-wrap break-all">
                                {formatPaymentReference(row)}
                              </td>
                              <td className="px-2 py-1.5 text-[10px] text-slate-600">
                                {Number(row.discountPercent ?? 0) > 0
                                  ? `${Number(row.discountPercent)}% (${Number(row.discountAmount ?? 0).toFixed(2)})`
                                  : "—"}
                              </td>
                              <td className="px-2 py-1.5">{row.service.name === "Membership" ? row.collectionStatus : "N/A"}</td>
                              <td className="px-2 py-1.5 text-right">
                                {Number(row.amount).toFixed(2)}
                                {Number(row.discountPercent ?? 0) > 0 ? (
                                  <p className="text-[10px] text-slate-400">from {Number(row.grossAmount ?? row.amount).toFixed(2)}</p>
                                ) : null}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {pendingDeleteId ? (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] grid place-items-center p-4 z-40">
          <Card className="p-5 max-w-md w-full space-y-3 surface-card shadow-xl fade-in-up">
            <h3 className="text-lg font-semibold text-red-700">Delete User?</h3>
            <p className="text-sm text-slate-600">This action cannot be undone and will remove user attendance history.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="border-slate-300 hover:bg-slate-100" onClick={() => setPendingDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="shadow-sm"
                onClick={async () => {
                  const res = await fetch(`/api/users/${pendingDeleteId}`, { method: "DELETE" });
                  const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                  if (!json.success) {
                    showNotice("error", json.details || json.error || "Failed to delete user.");
                    return;
                  }
                  setPendingDeleteId(null);
                  await load();
                  showNotice("success", "User deleted successfully.");
                }}
              >
                Delete
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {editingUser ? (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] grid place-items-center p-4 z-40">
          <Card className="p-5 max-w-lg w-full surface-card shadow-xl fade-in-up space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Edit Member Profile</h3>
                <p className="text-sm text-slate-500">Changes save instantly to the local database.</p>
              </div>
              <Button
                variant="outline"
                className="border-slate-300 hover:bg-slate-100"
                onClick={() => {
                  setEditingUser(null);
                  setMemberPassword("");
                  setRenewDays(30);
                }}
              >
                Close
              </Button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">First Name</label>
                <Input value={editingUser.firstName} onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Last Name</label>
                <Input value={editingUser.lastName} onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Contact Number</label>
                <Input value={editingUser.contactNo ?? ""} onChange={(e) => setEditingUser({ ...editingUser, contactNo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Email (optional)</label>
                <Input value={editingUser.email ?? ""} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Address (optional)</label>
                <Input value={editingUser.address ?? ""} onChange={(e) => setEditingUser({ ...editingUser, address: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
                <Input value={editingUser.notes ?? ""} onChange={(e) => setEditingUser({ ...editingUser, notes: e.target.value })} />
              </div>
              {editingUser.role === "MEMBER" ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Membership Start</label>
                    <Input
                      type="date"
                      value={editingUser.membershipStart ? new Date(editingUser.membershipStart).toISOString().slice(0, 10) : ""}
                      onChange={(e) => setEditingUser({ ...editingUser, membershipStart: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Membership Expiry</label>
                    <Input
                      type="date"
                      value={editingUser.membershipExpiry ? new Date(editingUser.membershipExpiry).toISOString().slice(0, 10) : ""}
                      onChange={(e) => setEditingUser({ ...editingUser, membershipExpiry: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
                    />
                  </div>
                  <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Remaining Days:{" "}
                    <span className="font-semibold text-slate-800">
                      {editingUser.membershipExpiry ? `${differenceInCalendarDays(new Date(editingUser.membershipExpiry), new Date())} day(s)` : "N/A"}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Member Login Password (optional)</label>
                <Input
                  type="password"
                  value={memberPassword}
                  onChange={(e) => setMemberPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-slate-600">
                Role: <span className="font-semibold">{formatRoleLabel(editingUser.role)}</span>
              </div>
              <div className="flex gap-2">
                {editingUser.role === "MEMBER" ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      className="w-24"
                      value={renewDays}
                      onChange={(e) => setRenewDays(Math.max(1, Number(e.target.value || 30)))}
                    />
                    <Button
                      variant="outline"
                      className="border-slate-300 hover:bg-slate-100"
                      disabled={savingProfile}
                      onClick={async () => {
                        setSavingProfile(true);
                        const res = await fetch(`/api/users/${editingUser.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ renewMembership: true, renewDays }),
                        });
                        const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                        setSavingProfile(false);
                        if (!json.success) {
                          showNotice("error", json.details || json.error || "Failed to renew membership.");
                          return;
                        }
                        setEditingUser(null);
                        await load();
                        showNotice("success", `Membership renewed by ${renewDays} day(s).`);
                      }}
                    >
                      Renew +{renewDays} days
                    </Button>
                  </div>
                ) : null}
                <Button
                  className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
                  disabled={savingProfile}
                  onClick={async () => {
                    setSavingProfile(true);
                    const res = await fetch(`/api/users/${editingUser.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        firstName: editingUser.firstName,
                        lastName: editingUser.lastName,
                        contactNo: editingUser.contactNo ?? "",
                        email: editingUser.email ?? null,
                        profileImageUrl: editingUser.profileImageUrl ?? null,
                        address: editingUser.address ?? null,
                        notes: editingUser.notes ?? null,
                        membershipStart: editingUser.role === "MEMBER" ? editingUser.membershipStart ?? null : null,
                        membershipExpiry: editingUser.role === "MEMBER" ? editingUser.membershipExpiry ?? null : null,
                        memberPassword,
                      }),
                    });
                    const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                    setSavingProfile(false);
                    if (!json.success) {
                      showNotice("error", json.details || json.error || "Failed to save profile.");
                      return;
                    }
                    setEditingUser(null);
                    setMemberPassword("");
                    setRenewDays(30);
                    await load();
                    showNotice("success", "Profile updated successfully.");
                  }}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}
