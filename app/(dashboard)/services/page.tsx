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
          <p className="text-sm text-slate-500">Add unlimited additional services and keep pricing configurable.</p>
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
          {sorted.map((service) => (
            <div key={service.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div>
                <p className="font-semibold text-slate-800">{service.name}</p>
                <p className="text-xs text-slate-600">{service.tier} · PHP {Number(service.monthlyRate).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2">
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
          ))}
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
