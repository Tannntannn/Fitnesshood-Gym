"use client";

import { useEffect, useMemo, useState } from "react";
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
  role: UserRole;
  qrCodeImage: string;
  createdAt: string;
};

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
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("ALL");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [clientPreviewUser, setClientPreviewUser] = useState<UserRow | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Record<string, UserRole>>({});
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [memberPassword, setMemberPassword] = useState("");
  const [renewDays, setRenewDays] = useState(30);
  const [savingProfile, setSavingProfile] = useState(false);

  const load = async () => {
    const response = await fetch("/api/users");
    const data = (await response.json()) as { data: UserRow[] };
    setUsers(data.data ?? []);
  };

  useEffect(() => {
    load();

    const interval = setInterval(() => {
      load();
    }, 3000);

    const onFocus = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
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

  return (
    <Card className="surface-card space-y-5 p-5 lg:p-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">All Users</h1>
          <p className="text-sm text-slate-500">Manage member profiles, QR codes, and role assignments.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5 w-full lg:w-auto">
          <Input placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-64" />
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
                              await fetch(`/api/users/${user.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ role: nextRole }),
                              });
                              await load();
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
                            onClick={() => setSelected(user)}
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
          <Card className="w-full max-w-6xl h-[85vh] p-3 sm:p-4 surface-card shadow-xl fade-in-up flex flex-col gap-3">
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

            <div className="flex-1 rounded-xl border border-slate-200 overflow-hidden bg-white">
              <iframe
                src={`/client/${clientPreviewUser.id}`}
                title="Client dashboard preview"
                className="h-full w-full"
              />
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
                  await fetch(`/api/users/${pendingDeleteId}`, { method: "DELETE" });
                  setPendingDeleteId(null);
                  await load();
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
                        await fetch(`/api/users/${editingUser.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ renewMembership: true, renewDays }),
                        });
                        setSavingProfile(false);
                        setEditingUser(null);
                        await load();
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
                    await fetch(`/api/users/${editingUser.id}`, {
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
                    setSavingProfile(false);
                    setEditingUser(null);
                    setMemberPassword("");
                    setRenewDays(30);
                    await load();
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
