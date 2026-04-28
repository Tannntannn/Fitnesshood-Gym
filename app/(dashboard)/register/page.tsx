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

  useEffect(() => {
    const loadCoaches = async () => {
      const res = await fetch("/api/coaches");
      const json = (await res.json()) as { success: boolean; data?: CoachRow[] };
      if (json.success) setCoaches(json.data ?? []);
    };
    loadCoaches();
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
    <div className="grid lg:grid-cols-2 gap-4 fade-in-up">
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
  );
}
