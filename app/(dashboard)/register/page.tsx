"use client";

import { useState } from "react";
import { UserRole } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QrDisplay } from "@/components/qr-display";
import { Label } from "@/components/ui/label";
import { formatRoleLabel } from "@/lib/role-labels";

type CreatedUser = { firstName: string; lastName: string; role: UserRole; qrCodeImage: string };

export default function RegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [role, setRole] = useState<UserRole>("MEMBER");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<CreatedUser | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!firstName || !lastName) return setError("First name and last name are required.");
    if (!email.trim()) return setError("Email is required.");
    setLoading(true);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, contactNo, email, address, notes, role }),
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
