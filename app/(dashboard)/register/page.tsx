"use client";

import { useEffect, useState } from "react";
import { UserRole } from "@prisma/client";
import { addDays, format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QrDisplay } from "@/components/qr-display";
import { Label } from "@/components/ui/label";
import { formatRoleLabel } from "@/lib/role-labels";

type CreatedUser = { firstName: string; lastName: string; role: UserRole; qrCodeImage: string };
type TierPreset = { lockInLabel: string; monthlyFeeLabel: string; membershipFeeLabel: string };
type CoachRow = { id: string; name: string };
type AccessCodeRow = {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: string | null;
  createdAt: string;
};
type RegistrationRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: "REGISTERED" | "APPROVED" | "DECLINED";
  profileImageUrl: string;
  createdAt: string;
};

const tierPresets: Record<string, TierPreset> = {
  Bronze: { lockInLabel: "No Lock-in", monthlyFeeLabel: "₱1,200.00", membershipFeeLabel: "₱0.00" },
  Silver: { lockInLabel: "6 Months Lock-In", monthlyFeeLabel: "₱1,000.00", membershipFeeLabel: "₱800.00" },
  Gold: { lockInLabel: "9 Months Lock-In", monthlyFeeLabel: "₱950.00", membershipFeeLabel: "₱500.00" },
  Platinum: { lockInLabel: "12 Months Lock-In", monthlyFeeLabel: "₱900.00", membershipFeeLabel: "₱500.00" },
  Students: { lockInLabel: "3 Months Lock-In", monthlyFeeLabel: "₱900.00", membershipFeeLabel: "₱500.00" },
};

export default function RegisterPage() {
  const today = new Date();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [role, setRole] = useState<UserRole>("MEMBER");
  const [membershipStart, setMembershipStart] = useState(format(today, "yyyy-MM-dd"));
  const [membershipExpiry, setMembershipExpiry] = useState(format(addDays(today, 30), "yyyy-MM-dd"));
  const [membershipTier, setMembershipTier] = useState<keyof typeof tierPresets>("Silver");
  const [lockInLabel, setLockInLabel] = useState("6 Months Lock-In");
  const [monthlyFeeLabel, setMonthlyFeeLabel] = useState("₱1,000.00");
  const [membershipFeeLabel, setMembershipFeeLabel] = useState("₱800.00");
  const [gracePeriodEnd, setGracePeriodEnd] = useState("");
  const [freezeStatus, setFreezeStatus] = useState("");
  const [membershipNotes, setMembershipNotes] = useState("");
  const [coachName, setCoachName] = useState("");
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const [accessCodes, setAccessCodes] = useState<AccessCodeRow[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<RegistrationRow[]>([]);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [registrationNotice, setRegistrationNotice] = useState("");
  const [codeDurationDays, setCodeDurationDays] = useState(7);
  const [codeMaxUses, setCodeMaxUses] = useState(5);

  useEffect(() => {
    const loadCoaches = async () => {
      const res = await fetch("/api/coaches");
      const json = (await res.json()) as { success: boolean; data?: CoachRow[] };
      if (json.success) setCoaches(json.data ?? []);
    };
    loadCoaches();
  }, []);

  const loadRegistrationData = async () => {
    try {
      const [codesRes, pendingRes] = await Promise.all([
        fetch("/api/client/registrations/access-code"),
        fetch("/api/client/registrations?status=REGISTERED&take=50"),
      ]);
      const codesJson = (await codesRes.json()) as { success?: boolean; data?: AccessCodeRow[] };
      const pendingJson = (await pendingRes.json()) as { success?: boolean; data?: RegistrationRow[] };
      setAccessCodes(codesJson.success ? (codesJson.data ?? []) : []);
      setPendingRegistrations(pendingJson.success ? (pendingJson.data ?? []) : []);
    } catch {
      setRegistrationNotice("Unable to load walk-in registration data.");
    }
  };

  useEffect(() => {
    void loadRegistrationData();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!firstName || !lastName) return setError("First name and last name are required.");
    if (!email.trim()) return setError("Email is required.");
    setLoading(true);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        contactNo,
        email,
        address,
        notes,
        role,
        membershipStart: role === "MEMBER" ? membershipStart : null,
        membershipExpiry: role === "MEMBER" ? membershipExpiry : null,
        membershipTier: role === "MEMBER" ? membershipTier : null,
        lockInLabel: role === "MEMBER" ? lockInLabel : null,
        monthlyFeeLabel: role === "MEMBER" ? monthlyFeeLabel : null,
        membershipFeeLabel: role === "MEMBER" ? membershipFeeLabel : null,
        gracePeriodEnd: role === "MEMBER" ? gracePeriodEnd || null : null,
        freezeStatus: role === "MEMBER" ? freezeStatus || null : null,
        membershipNotes: role === "MEMBER" ? membershipNotes || null : null,
        coachName: coachName || null,
      }),
    });
    const data = (await response.json()) as { success: boolean; data?: CreatedUser; error?: string };
    setLoading(false);
    if (!data.success || !data.data) return setError(data.error ?? "Registration failed.");
    setCreated(data.data);
    setFirstName("");
    setLastName("");
    setContactNo("");
    setEmail("");
    setAddress("");
    setNotes("");
    setMembershipStart(format(new Date(), "yyyy-MM-dd"));
    setMembershipExpiry(format(addDays(new Date(), 30), "yyyy-MM-dd"));
    setMembershipTier("Silver");
    setLockInLabel(tierPresets.Silver.lockInLabel);
    setMonthlyFeeLabel(tierPresets.Silver.monthlyFeeLabel);
    setMembershipFeeLabel(tierPresets.Silver.membershipFeeLabel);
    setGracePeriodEnd("");
    setFreezeStatus("");
    setMembershipNotes("");
    setCoachName("");
  };

  return (
    <div className="space-y-4 fade-in-up">
      <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-5 surface-card surface-card-interactive">
        <h2 className="font-semibold text-lg mb-4 text-slate-800">Register User</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">First Name</Label>
            <Input id="first-name" placeholder="Enter first name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name">Last Name</Label>
            <Input id="last-name" placeholder="Enter last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactNo">Contact Number</Label>
            <Input id="contactNo" placeholder="09xxxxxxxxx" value={contactNo} onChange={(e) => setContactNo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email (required for user dashboard)</Label>
            <Input id="email" placeholder="name@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Address (optional)</Label>
            <Input id="address" placeholder="Enter address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" placeholder="Any notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coach-name">Coach (optional)</Label>
            <select
              id="coach-name"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
              value={coachName}
              onChange={(e) => setCoachName(e.target.value)}
            >
              <option value="">No coach assigned</option>
              {coaches.map((coach) => (
                <option key={coach.id} value={coach.name}>
                  {coach.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              className="w-full h-9 border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
            <option value="MEMBER">Member</option>
            <option value="NON_MEMBER">Non-Member</option>
            <option value="WALK_IN">Walk-in (Student)</option>
            <option value="WALK_IN_REGULAR">Walk-in (Regular)</option>
          </select>
          </div>
          {role === "MEMBER" ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="membership-start">Membership Start</Label>
                <Input
                  id="membership-start"
                  type="date"
                  value={membershipStart}
                  onChange={(e) => setMembershipStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="membership-expiry">Membership Expiry</Label>
                <Input
                  id="membership-expiry"
                  type="date"
                  value={membershipExpiry}
                  onChange={(e) => setMembershipExpiry(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="membership-tier">Membership Tier</Label>
                <select
                  id="membership-tier"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                  value={membershipTier}
                  onChange={(e) => {
                    const nextTier = e.target.value as keyof typeof tierPresets;
                    const preset = tierPresets[nextTier];
                    setMembershipTier(nextTier);
                    setLockInLabel(preset.lockInLabel);
                    setMonthlyFeeLabel(preset.monthlyFeeLabel);
                    setMembershipFeeLabel(preset.membershipFeeLabel);
                  }}
                >
                  {Object.keys(tierPresets).map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lockin-label">Lock-in</Label>
                <Input id="lockin-label" value={lockInLabel} onChange={(e) => setLockInLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monthly-fee">Monthly Fee</Label>
                <Input id="monthly-fee" value={monthlyFeeLabel} onChange={(e) => setMonthlyFeeLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="membership-fee">Membership Fee</Label>
                <Input id="membership-fee" value={membershipFeeLabel} onChange={(e) => setMembershipFeeLabel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grace-end">Grace Period End</Label>
                <Input id="grace-end" type="date" value={gracePeriodEnd} onChange={(e) => setGracePeriodEnd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="freeze-status">Freeze Status</Label>
                <Input id="freeze-status" value={freezeStatus} onChange={(e) => setFreezeStatus(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="membership-notes">Membership Notes</Label>
                <Input id="membership-notes" value={membershipNotes} onChange={(e) => setMembershipNotes(e.target.value)} />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90 transition-all duration-200" disabled={loading}>
            {loading ? "Submitting..." : "Register"}
          </Button>
        </form>
      </Card>

      <Card className="p-5 surface-card surface-card-interactive">
        <h2 className="font-semibold text-lg mb-4 text-slate-800">Generated QR</h2>
        {created ? (
          <QrDisplay
            name={`${created.firstName} ${created.lastName}`}
            role={formatRoleLabel(created.role)}
            qrCodeImage={created.qrCodeImage}
          />
        ) : (
          <p className="text-slate-500">No QR generated yet.</p>
        )}
      </Card>
      </div>

      <Card className="p-5 surface-card surface-card-interactive space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Walk-in Access Code</h3>
            <p className="text-sm text-slate-500">Generate codes for client self-registration.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="code-max-uses">Max uses</Label>
              <Input
                id="code-max-uses"
                type="number"
                min={1}
                className="w-24"
                value={codeMaxUses}
                onChange={(e) => setCodeMaxUses(Math.max(1, Math.trunc(Number(e.target.value || 1))))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="code-duration">Duration (days)</Label>
              <Input
                id="code-duration"
                type="number"
                min={1}
                className="w-28"
                value={codeDurationDays}
                onChange={(e) => setCodeDurationDays(Math.max(1, Math.trunc(Number(e.target.value || 1))))}
              />
            </div>
          <Button
            type="button"
            disabled={generatingCode}
            onClick={async () => {
              setGeneratingCode(true);
              setRegistrationNotice("");
              try {
                const res = await fetch("/api/client/registrations/access-code", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ maxUses: codeMaxUses, expiresInDays: codeDurationDays }),
                });
                const json = (await res.json()) as { success?: boolean; error?: string; data?: AccessCodeRow };
                if (!json.success || !json.data) {
                  setRegistrationNotice(json.error ?? "Unable to generate access code.");
                } else {
                  setAccessCodes((prev) => [json.data as AccessCodeRow, ...prev].slice(0, 30));
                  setRegistrationNotice(`New code generated: ${json.data.code}`);
                }
              } catch {
                setRegistrationNotice("Unable to generate access code.");
              } finally {
                setGeneratingCode(false);
              }
            }}
          >
            {generatingCode ? "Generating..." : "Generate Code"}
          </Button>
          </div>
        </div>

        {registrationNotice ? <p className="text-sm text-[#1e3a5f]">{registrationNotice}</p> : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Code</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Usage</th>
                <th className="px-3 py-2 text-left font-semibold">Expires</th>
                <th className="px-3 py-2 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accessCodes.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={5}>No access codes yet.</td>
                </tr>
              ) : (
                accessCodes.map((code) => (
                  <tr key={code.id}>
                    <td className="px-3 py-2 font-mono">{code.code}</td>
                    <td className="px-3 py-2">{code.isActive ? "Active" : "Inactive"}</td>
                    <td className="px-3 py-2">{code.usedCount}/{code.maxUses}</td>
                    <td className="px-3 py-2">{code.expiresAt ? format(new Date(code.expiresAt), "MMM d, yyyy") : "No expiry"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const nextMaxUsesRaw = window.prompt("Set max uses:", String(code.maxUses));
                            if (!nextMaxUsesRaw) return;
                            const nextMaxUses = Math.max(1, Math.trunc(Number(nextMaxUsesRaw)));
                            if (!Number.isFinite(nextMaxUses)) return;
                            const res = await fetch(`/api/client/registrations/access-code/${code.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ maxUses: nextMaxUses }),
                            });
                            const json = (await res.json()) as { success?: boolean; error?: string };
                            if (!json.success) setRegistrationNotice(json.error ?? "Failed to update max uses.");
                            else {
                              setRegistrationNotice(`Updated max uses for ${code.code}.`);
                              await loadRegistrationData();
                            }
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const res = await fetch(`/api/client/registrations/access-code/${code.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ isActive: !code.isActive }),
                            });
                            const json = (await res.json()) as { success?: boolean; error?: string };
                            if (!json.success) setRegistrationNotice(json.error ?? "Failed to toggle code.");
                            else {
                              setRegistrationNotice(`${code.code} ${code.isActive ? "deactivated" : "activated"}.`);
                              await loadRegistrationData();
                            }
                          }}
                        >
                          {code.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            if (!window.confirm(`Delete code ${code.code}?`)) return;
                            const res = await fetch(`/api/client/registrations/access-code/${code.id}`, { method: "DELETE" });
                            const json = (await res.json()) as { success?: boolean; error?: string };
                            if (!json.success) setRegistrationNotice(json.error ?? "Failed to delete code.");
                            else {
                              setRegistrationNotice(`${code.code} deleted.`);
                              await loadRegistrationData();
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 surface-card surface-card-interactive space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Newly Registered Walk-ins</h3>
          <p className="text-sm text-slate-500">Approve or decline pending registrations from access-code signups.</p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Email</th>
                <th className="px-3 py-2 text-left font-semibold">Role</th>
                <th className="px-3 py-2 text-left font-semibold">Photo</th>
                <th className="px-3 py-2 text-left font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingRegistrations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-slate-500">No pending registrations.</td>
                </tr>
              ) : (
                pendingRegistrations.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{row.firstName} {row.lastName}</td>
                    <td className="px-3 py-2">{row.email}</td>
                    <td className="px-3 py-2">{formatRoleLabel(row.role)}</td>
                    <td className="px-3 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.profileImageUrl} alt="" className="h-10 w-10 rounded object-cover border border-slate-200" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={reviewingId === row.id}
                          onClick={async () => {
                            setReviewingId(row.id);
                            try {
                              const res = await fetch(`/api/client/registrations/${row.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ decision: "APPROVE" }),
                              });
                              const json = (await res.json()) as { success?: boolean; error?: string };
                              if (!json.success) {
                                setRegistrationNotice(json.error ?? "Approval failed.");
                              } else {
                                setPendingRegistrations((prev) => prev.filter((item) => item.id !== row.id));
                                setRegistrationNotice(`${row.firstName} ${row.lastName} approved and added to users.`);
                              }
                            } catch {
                              setRegistrationNotice("Approval failed.");
                            } finally {
                              setReviewingId(null);
                            }
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={reviewingId === row.id}
                          onClick={async () => {
                            setReviewingId(row.id);
                            try {
                              const res = await fetch(`/api/client/registrations/${row.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ decision: "DECLINE" }),
                              });
                              const json = (await res.json()) as { success?: boolean; error?: string };
                              if (!json.success) {
                                setRegistrationNotice(json.error ?? "Decline failed.");
                              } else {
                                setPendingRegistrations((prev) => prev.filter((item) => item.id !== row.id));
                                setRegistrationNotice(`${row.firstName} ${row.lastName} declined.`);
                              }
                            } catch {
                              setRegistrationNotice("Decline failed.");
                            } finally {
                              setReviewingId(null);
                            }
                          }}
                        >
                          Decline
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
