"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardConfirmDialog } from "@/components/dashboard-confirm-dialog";

type ServiceRow = {
  id: string;
  name: string;
  tier: string;
  monthlyRate: string;
  contractMonths: number;
  accessCycleDays: number;
  membershipFee: string;
  contractPrice: string;
  isActive: boolean;
};

type TierOption = "ALL" | "MEMBER" | "Non-member" | "Walk-in Student" | "Walk-in Regular";

const tierOptions: TierOption[] = ["ALL", "MEMBER", "Non-member", "Walk-in Student", "Walk-in Regular"];

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<TierOption>("ALL");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [pendingDeleteService, setPendingDeleteService] = useState<ServiceRow | null>(null);
  const [error, setError] = useState("");
  const [membershipTierSavingId, setMembershipTierSavingId] = useState<string | null>(null);
  const [membershipTierDrafts, setMembershipTierDrafts] = useState<
    Record<string, { tier: string; monthly: string; membershipFee: string; lockIn: string; accessDays: string }>
  >({});

  const load = async () => {
    const res = await fetch("/api/services?includeInactive=true");
    const json = (await res.json()) as { success: boolean; data?: ServiceRow[] };
    if (json.success) setServices(json.data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(
    () =>
      services
        .slice()
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name) || a.tier.localeCompare(b.tier)),
    [services],
  );

  return (
    <div className="space-y-4">
      <Card className="surface-card space-y-3 p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Services and Pricing</h1>
          <p className="text-sm text-slate-500">
            Add services and set prices. For <span className="font-medium text-slate-700">Membership</span> tiers, monthly rate
            drives POS renewals; set <span className="font-medium text-slate-700">lock-in months</span> and
            <span className="font-medium text-slate-700"> access days</span> per payment.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1.2fr_0.9fr_0.8fr_auto]">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Service Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Personal Training Session" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Audience</label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
              value={tier}
              onChange={(e) => setTier(e.target.value as TierOption)}
            >
              {tierOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Price</label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div className="self-end">
            <Button
              className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
              disabled={saving}
              onClick={async () => {
                setError("");
                const numPrice = Number(price);
                if (!name.trim() || !Number.isFinite(numPrice) || numPrice <= 0) {
                  setError("Please enter service name and valid price.");
                  return;
                }
                setSaving(true);
                const res = await fetch("/api/services", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: name.trim(),
                    tier,
                    monthlyRate: numPrice,
                    contractMonths: 0,
                    membershipFee: 0,
                    contractPrice: numPrice,
                  }),
                });
                const json = (await res.json()) as { success: boolean; error?: string; details?: string };
                setSaving(false);
                if (!json.success) {
                  setError(json.error || json.details || "Failed to save service.");
                  return;
                }
                setName("");
                setPrice("");
                await load();
              }}
            >
              {saving ? "Saving..." : "Add Service"}
            </Button>
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </Card>

      <Card className="surface-card p-5">
        <h2 className="text-base font-semibold text-slate-900">Service Catalog</h2>
        <p className="mb-3 text-xs text-slate-500">Toggle active status anytime. Inactive services are hidden in payment selection.</p>
        <div className="space-y-2">
          {sorted.map((service) => {
            const draft =
              membershipTierDrafts[service.id] ?? {
                tier: service.tier,
                monthly: String(Number(service.monthlyRate) || 0),
                membershipFee: String(Number(service.membershipFee) || 0),
                lockIn: String(Math.max(0, service.contractMonths)),
                accessDays: String(Math.max(1, Number(service.accessCycleDays) || 30)),
              };
            const isMembershipTier = service.name.trim() === "Membership";
            return (
            <div key={service.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{service.name}</p>
                  <p className="text-xs text-slate-600">{service.tier} · PHP {Number(service.monthlyRate).toFixed(2)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-slate-300 bg-white hover:bg-slate-100"
                    onClick={async () => {
                      await fetch(`/api/services/${service.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ isActive: !service.isActive }),
                      });
                      await load();
                    }}
                  >
                    {service.isActive ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-red-300 bg-white text-red-700 hover:bg-red-50"
                    disabled={deletingServiceId === service.id}
                    onClick={() => {
                      setError("");
                      setPendingDeleteService(service);
                    }}
                  >
                    {deletingServiceId === service.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
              {isMembershipTier ? (
                <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200/90 pt-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600" htmlFor={`tier-${service.id}`}>
                      Tier label
                    </label>
                    <Input
                      id={`tier-${service.id}`}
                      className="h-9 w-36"
                      value={draft.tier}
                      onChange={(e) =>
                        setMembershipTierDrafts((prev) => ({
                          ...prev,
                          [service.id]: { ...draft, tier: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600" htmlFor={`mrate-${service.id}`}>
                      Monthly rate (PHP)
                    </label>
                    <Input
                      id={`mrate-${service.id}`}
                      className="h-9 w-32"
                      inputMode="decimal"
                      value={draft.monthly}
                      onChange={(e) =>
                        setMembershipTierDrafts((prev) => ({
                          ...prev,
                          [service.id]: { ...draft, monthly: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600" htmlFor={`mfee-${service.id}`}>
                      Membership fee (PHP)
                    </label>
                    <Input
                      id={`mfee-${service.id}`}
                      className="h-9 w-32"
                      inputMode="decimal"
                      value={draft.membershipFee}
                      onChange={(e) =>
                        setMembershipTierDrafts((prev) => ({
                          ...prev,
                          [service.id]: { ...draft, membershipFee: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600" htmlFor={`lock-${service.id}`}>
                      Lock-in (months, label)
                    </label>
                    <Input
                      id={`lock-${service.id}`}
                      className="h-9 w-24"
                      inputMode="numeric"
                      value={draft.lockIn}
                      onChange={(e) =>
                        setMembershipTierDrafts((prev) => ({
                          ...prev,
                          [service.id]: { ...draft, lockIn: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-slate-600" htmlFor={`access-${service.id}`}>
                      Access days per payment
                    </label>
                    <Input
                      id={`access-${service.id}`}
                      className="h-9 w-24"
                      inputMode="numeric"
                      value={draft.accessDays}
                      onChange={(e) =>
                        setMembershipTierDrafts((prev) => ({
                          ...prev,
                          [service.id]: { ...draft, accessDays: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <Button
                    className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
                    disabled={membershipTierSavingId === service.id}
                    onClick={async () => {
                      setError("");
                      const tierName = draft.tier.trim();
                      const monthly = Number(draft.monthly);
                      const membershipFee = Number(draft.membershipFee);
                      const lockIn = Math.max(0, Math.trunc(Number(draft.lockIn)));
                      const accessDays = Math.max(1, Math.trunc(Number(draft.accessDays)));
                      if (!tierName) {
                        setError("Tier label is required.");
                        return;
                      }
                      if (!Number.isFinite(monthly) || monthly <= 0) {
                        setError("Membership tier needs a valid monthly rate greater than zero.");
                        return;
                      }
                      if (!Number.isFinite(membershipFee) || membershipFee < 0) {
                        setError("Membership fee must be zero or higher.");
                        return;
                      }
                      if (!Number.isFinite(lockIn) || lockIn < 0) {
                        setError("Lock-in months must be zero or a positive whole number.");
                        return;
                      }
                      if (!Number.isFinite(accessDays) || accessDays < 1) {
                        setError("Access days must be a positive whole number.");
                        return;
                      }
                      setMembershipTierSavingId(service.id);
                      const res = await fetch(`/api/services/${service.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          tier: tierName,
                          monthlyRate: monthly,
                          membershipFee,
                          contractMonths: lockIn,
                          accessCycleDays: accessDays,
                          contractPrice: monthly,
                        }),
                      });
                      const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                      setMembershipTierSavingId(null);
                      if (!json.success) {
                        setError(json.error || json.details || "Failed to update tier.");
                        return;
                      }
                      setMembershipTierDrafts((prev) => {
                        const next = { ...prev };
                        delete next[service.id];
                        return next;
                      });
                      await load();
                    }}
                  >
                    {membershipTierSavingId === service.id ? "Saving…" : "Save tier"}
                  </Button>
                </div>
              ) : null}
            </div>
            );
          })}
          {sorted.length === 0 ? <p className="text-sm text-slate-500">No services found yet.</p> : null}
        </div>
      </Card>

      <DashboardConfirmDialog
        open={Boolean(pendingDeleteService)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteService(null);
        }}
        title="Delete service?"
        description={
          pendingDeleteService ? (
            <>
              Permanently remove{" "}
              <span className="font-semibold text-slate-800">
                {pendingDeleteService.name} ({pendingDeleteService.tier})
              </span>
              . This cannot be undone.
            </>
          ) : null
        }
        tone="danger"
        confirmLabel="Delete service"
        cancelLabel="Cancel"
        loading={Boolean(pendingDeleteService && deletingServiceId === pendingDeleteService.id)}
        onConfirm={async () => {
          const svc = pendingDeleteService;
          if (!svc) return;
          setDeletingServiceId(svc.id);
          const res = await fetch(`/api/services/${svc.id}`, { method: "DELETE" });
          const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
          setDeletingServiceId(null);
          if (!json.success) {
            setError(json.details || json.error || "Failed to delete service.");
            return;
          }
          await load();
        }}
      />
    </div>
  );
}
