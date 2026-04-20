import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase";

const SYNC_BATCH = 200;
const USERS_TABLE = process.env.SUPABASE_USERS_TABLE ?? "users";
const ATTENDANCE_TABLE = process.env.SUPABASE_ATTENDANCE_TABLE ?? "attendance";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncUsers() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false as const, reason: "missing_supabase_service_key" as const };

  const users = await prisma.user.findMany({
    where: { syncedAt: null },
    orderBy: { updatedAt: "asc" },
    take: SYNC_BATCH,
  });

  if (users.length === 0) return { ok: true as const, pushed: 0 };

  const payload = users.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    address: u.address,
    role: u.role,
    qrCode: u.qrCode,
    qrCodeImage: u.qrCodeImage,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }));

  const { error } = await supabase.from(USERS_TABLE).upsert(payload, { onConflict: "id" });
  if (error) return { ok: false as const, reason: error.message };

  const now = new Date();
  await prisma.user.updateMany({
    where: { id: { in: users.map((u) => u.id) } },
    data: { syncedAt: now },
  });

  return { ok: true as const, pushed: users.length };
}

async function syncAttendance() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false as const, reason: "missing_supabase_service_key" as const };

  const rows = await prisma.attendance.findMany({
    where: { syncedAt: null },
    orderBy: { updatedAt: "asc" },
    take: SYNC_BATCH,
  });

  if (rows.length === 0) return { ok: true as const, pushed: 0 };

  const payload = rows.map((a) => ({
    id: a.id,
    userId: a.userId,
    roleSnapshot: a.roleSnapshot,
    scannedAt: a.scannedAt.toISOString(),
    date: a.date.toISOString(),
    timeIn: a.timeIn,
    dayOfWeek: a.dayOfWeek,
    month: a.month,
    year: a.year,
    createdAt: a.scannedAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  const { error } = await supabase.from(ATTENDANCE_TABLE).upsert(payload, { onConflict: "id" });
  if (error) return { ok: false as const, reason: error.message };

  const now = new Date();
  await prisma.attendance.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { syncedAt: now },
  });

  return { ok: true as const, pushed: rows.length };
}

async function runOnce() {
  // Users first (attendance depends on userId existing)
  const u = await syncUsers();
  if (!u.ok) return u;
  const a = await syncAttendance();
  if (!a.ok) return a;
  return { ok: true as const, pushedUsers: u.pushed, pushedAttendance: a.pushed };
}

async function main() {
  let backoff = 2000;
  const maxBackoff = 60000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await runOnce();
      if (result.ok) {
        backoff = 2000;
        await sleep(5000);
      } else {
        backoff = Math.min(maxBackoff, Math.floor(backoff * 1.6));
        await sleep(backoff);
      }
    } catch {
      backoff = Math.min(maxBackoff, Math.floor(backoff * 1.6));
      await sleep(backoff);
    }
  }
}

main();

