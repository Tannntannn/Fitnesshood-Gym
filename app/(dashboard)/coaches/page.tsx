"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CoachRow = {
  id: string;
  name: string;
  isActive: boolean;
};
type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  coachName?: string | null;
};

export default function CoachesPage() {
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rows, setRows] = useState<CoachRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [name, setName] = useState("");
  const [memberInputByCoach, setMemberInputByCoach] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [assigningCoachId, setAssigningCoachId] = useState<string | null>(null);
  const [unassigningCoachId, setUnassigningCoachId] = useState<string | null>(null);
  const [deletingCoachId, setDeletingCoachId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showNotice = (type: "success" | "error", message: string) => {
    setNotice({ type, message });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  };

  const load = async () => {
    const [coachRes, memberRes] = await Promise.all([
      fetch("/api/coaches?includeInactive=true"),
      fetch("/api/users?view=assignment&role=MEMBER"),
    ]);
    const coachJson = (await coachRes.json()) as { success: boolean; data?: CoachRow[] };
    const memberJson = (await memberRes.json()) as { success: boolean; data?: MemberRow[] };
    if (coachJson.success) setRows(coachJson.data ?? []);
    if (memberJson.success) setMembers((memberJson.data ?? []).filter((member) => member.role === "MEMBER"));
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

  const sorted = useMemo(
    () => rows.slice().sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)),
    [rows],
  );
  const activeCoaches = useMemo(() => sorted.filter((coach) => coach.isActive), [sorted]);
  const assignedCountByCoach = useMemo(() => {
    return members.reduce<Record<string, number>>((acc, member) => {
      const coach = (member.coachName ?? "").trim();
      if (!coach) return acc;
      acc[coach] = (acc[coach] ?? 0) + 1;
      return acc;
    }, {});
  }, [members]);
  const assignedMembersByCoach = useMemo(() => {
    return members.reduce<Record<string, Array<{ id: string; fullName: string }>>>((acc, member) => {
      const coach = (member.coachName ?? "").trim();
      if (!coach) return acc;
      const current = acc[coach] ?? [];
      current.push({ id: member.id, fullName: `${member.firstName} ${member.lastName}` });
      acc[coach] = current;
      return acc;
    }, {});
  }, [members]);
  const unassignedMembers = useMemo(
    () =>
      members
        .filter((member) => !(member.coachName ?? "").trim())
        .slice()
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)),
    [members],
  );

  return (
    <div className="space-y-4">
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
      <Card className="surface-card space-y-3 p-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Coach Section</h1>
          <p className="text-sm text-slate-500">Add coach names manually, then assign members beside each coach row.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Coach name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coach Mark" />
          </div>
          <div className="self-end flex gap-2">
            <Button
              variant="outline"
              className="border-slate-300 bg-white hover:bg-slate-100"
              onClick={() => load()}
            >
              Refresh
            </Button>
            <Button
              className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
              disabled={saving}
              onClick={async () => {
                setError("");
                if (!name.trim()) {
                  setError("Coach name is required.");
                  return;
                }
                setSaving(true);
                const res = await fetch("/api/coaches", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: name.trim() }),
                });
                const json = (await res.json()) as { success: boolean; error?: string; details?: string };
                setSaving(false);
                if (!json.success) {
                  setError(json.error || json.details || "Failed to add coach.");
                  showNotice("error", json.error || json.details || "Failed to add coach.");
                  return;
                }
                setName("");
                await load();
                showNotice("success", "Coach added successfully.");
              }}
            >
              {saving ? "Adding..." : "Add Coach"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="surface-card p-5">
        <h2 className="text-base font-semibold text-slate-900">Coach List</h2>
        <div className="mt-3 space-y-2">
          {activeCoaches.map((coach) => (
            <div
              key={coach.id}
              className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-[1fr_1.3fr_auto_auto_auto] md:items-center"
            >
              <div>
                <p className="font-medium text-slate-800">{coach.name}</p>
                <p className="text-[11px] text-slate-500">Assigned members: {assignedCountByCoach[coach.name] ?? 0}</p>
                <div className="mt-2 max-h-24 overflow-auto space-y-1">
                  {(assignedMembersByCoach[coach.name] ?? []).length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500">
                      No assigned members yet.
                    </p>
                  ) : (
                    (assignedMembersByCoach[coach.name] ?? [])
                      .slice()
                      .sort((a, b) => a.fullName.localeCompare(b.fullName))
                      .map((member) => (
                        <p
                          key={`${coach.id}-${member.id}`}
                          className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold tracking-wide text-blue-900"
                        >
                          {member.fullName}
                        </p>
                      ))
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Input
                  value={memberInputByCoach[coach.id] ?? ""}
                  onChange={(e) => setMemberInputByCoach((prev) => ({ ...prev, [coach.id]: e.target.value }))}
                  list={`coach-member-options-${coach.id}`}
                  placeholder="Type member name to assign"
                />
                <datalist id={`coach-member-options-${coach.id}`}>
                  {members.map((member) => (
                    <option key={`${coach.id}-${member.id}`} value={`${member.firstName} ${member.lastName}`} />
                  ))}
                </datalist>
              </div>
              <Button
                className="bg-[#1e3a5f] text-white hover:bg-[#1e3a5f]/90"
                disabled={assigningCoachId === coach.id}
                onClick={async () => {
                  setError("");
                  const selectedName = (memberInputByCoach[coach.id] ?? "").trim();
                  const member = members.find((m) => `${m.firstName} ${m.lastName}` === selectedName) ?? null;
                  if (!member) {
                    setError("Please type and select an existing member name from suggestions.");
                    showNotice("error", "Please type and select an existing member.");
                    return;
                  }
                  setAssigningCoachId(coach.id);
                  const res = await fetch(`/api/users/${member.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ coachName: coach.name }),
                  });
                  const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                  if (!json.success) {
                    setAssigningCoachId(null);
                    setError(json.details || json.error || "Failed to assign coach.");
                    showNotice("error", json.details || json.error || "Failed to assign coach.");
                    return;
                  }
                  setAssigningCoachId(null);
                  setMemberInputByCoach((prev) => ({ ...prev, [coach.id]: "" }));
                  await load();
                  showNotice("success", `${selectedName} assigned to ${coach.name}.`);
                }}
              >
                {assigningCoachId === coach.id ? "Assigning..." : "Assign Member"}
              </Button>
              <Button
                variant="outline"
                className="border-red-300 bg-white text-red-700 hover:bg-red-50"
                disabled={unassigningCoachId === coach.id}
                onClick={async () => {
                  setError("");
                  const selectedName = (memberInputByCoach[coach.id] ?? "").trim();
                  const member = members.find((m) => `${m.firstName} ${m.lastName}` === selectedName) ?? null;
                  if (!member) {
                    setError("Type/select the member name first, then click Unassign.");
                    showNotice("error", "Type/select the member name first.");
                    return;
                  }
                  if ((member.coachName ?? "").trim() !== coach.name) {
                    setError(`${selectedName} is not currently assigned to ${coach.name}.`);
                    showNotice("error", `${selectedName} is not assigned to ${coach.name}.`);
                    return;
                  }
                  setUnassigningCoachId(coach.id);
                  const res = await fetch(`/api/users/${member.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ coachName: null }),
                  });
                  const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                  if (!json.success) {
                    setUnassigningCoachId(null);
                    setError(json.details || json.error || "Failed to unassign member.");
                    showNotice("error", json.details || json.error || "Failed to unassign member.");
                    return;
                  }
                  setUnassigningCoachId(null);
                  setMemberInputByCoach((prev) => ({ ...prev, [coach.id]: "" }));
                  await load();
                  showNotice("success", `${selectedName} unassigned from ${coach.name}.`);
                }}
              >
                {unassigningCoachId === coach.id ? "Unassigning..." : "Unassign Member"}
              </Button>
              <Button
                variant="outline"
                className="border-red-300 bg-white text-red-700 hover:bg-red-50"
                disabled={deletingCoachId === coach.id}
                onClick={async () => {
                  setError("");
                  const confirmed = window.confirm(`Delete coach "${coach.name}"?`);
                  if (!confirmed) return;
                  setDeletingCoachId(coach.id);
                  const res = await fetch(`/api/coaches/${coach.id}`, { method: "DELETE" });
                  const json = (await res.json()) as { success?: boolean; error?: string; details?: string };
                  setDeletingCoachId(null);
                  if (!json.success) {
                    setError(json.details || json.error || "Failed to delete coach.");
                    showNotice("error", json.details || json.error || "Failed to delete coach.");
                    return;
                  }
                  await load();
                  showNotice("success", `${coach.name} deleted.`);
                }}
              >
                {deletingCoachId === coach.id ? "Deleting..." : "Delete Coach"}
              </Button>
            </div>
          ))}
          {activeCoaches.length === 0 ? <p className="text-sm text-slate-500">No active coaches yet.</p> : null}
        </div>
      </Card>
      <Card className="surface-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Unassigned Members</h2>
          <span className="text-xs text-slate-500">{unassignedMembers.length} member(s)</span>
        </div>
        <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
          {unassignedMembers.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-500">
              All members have an assigned coach.
            </p>
          ) : (
            <div className="space-y-1.5">
              {unassignedMembers.map((member) => (
                <div
                  key={member.id}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
                >
                  {member.firstName} {member.lastName}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
