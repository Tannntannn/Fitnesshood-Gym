# Plan: Reduce Supabase usage

**Current focus: [Phase 1 — Egress limit](#phase-1-egress-limit-priority-below-5-gb--reset)** (database + storage traffic from Supabase).  
Other items (inactivity pause, `public/` background images) are **Phase 2** — they do not lower Supabase egress unless you host those assets on Storage or are addressing a different problem.

---

## What counts as Supabase egress

Traffic **leaving** your Supabase project: **Database** (Postgres result bytes to your app server), **Storage** (bytes downloaded from `*.supabase.co` for files), etc.

### Expected load (gym context)

**Roughly 50–100 clients on site per day** is a **moderate** operational load. By itself, that many check-ins, scans, and occasional client app opens is **not** what typically drives **tens of GB** of **database** egress in a month. What multiplies cost is **software behavior**: e.g. an **admin** tab open all day, **re-fetching huge result sets** every few seconds.

So for your gym: **Phase 1 (1A: polling + stop huge attendance pulls)** is still the right first move. **50–100/day** becomes a problem for egress mainly if every device is **hammering** list APIs, or if **Storage** is serving many **full-size** profile images on every view—both are fixable in **1A / 1B**.

### Realistic expectations

Implementing the plan is meant to **sharply cut** risk of hitting the cap, but it **does not** guarantee you stay under 5 GB every period—**traffic varies**, and Supabase can change how usage is shown. **After** changes, watch **Database vs Storage** in the dashboard and adjust (slower pollers, smaller pages, more caching) if the trend line is still too high.

---

## Phase 1: Egress limit (priority: below 5 GB / reset)

**Goal:** Cut **repeated** and **oversized** reads from Postgres, and **small** files + caching for anything in **Supabase Storage** (mainly profile images today).

### 1A — Database egress (usually the largest in this app)

- **Admin dashboard** calls `GET /api/attendance?limit=5000` on a **3s** timer (`app/(dashboard)/dashboard/page.tsx`). That can dominate egress: large JSON **every few seconds** per open tab.  
  **Do:** **smaller limit** and/or **date-bounded** query (e.g. “today” only for the scan list), **pause `setInterval` when `document.hidden`**, and use **60–120s+** interval or **refresh on focus** + after scan actions only.  
- **Other pages** with short `setInterval` (users, coaches, payment-records, client, members-management) — same pattern: **longer interval**, **no poll when tab hidden**, avoid refetching **entire** lists if not needed.  
- **APIs / Prisma:** use **pagination**, **narrow `select()`**, avoid returning full blobs on list endpoints.

### 1B — Storage egress (Supabase profile images)

- **Upload path:** `app/api/upload/profile/route.ts` — raw uploads up to 5 MB; no resize.  
  **Do:** process with **`sharp`**: max dimension (~512px), **WebP** output, **tighten** max input size, set **`cacheControl`** on upload.  
- **Optional:** in-memory (or short-TTL) cache for `createSignedUrl` in `lib/profile-image.ts`; **or** public bucket + long cache if acceptable.  
- **Optional later:** reprocess old huge avatars; migrate URLs.

### 1C — Know what to fix first (one-time check)

- In Supabase **Usage / Reports**: note **Database** vs **Storage** share of egress. If **Database** is most of it, **1A** first; if **Storage**, **1B** first.

### Phase 1 — Implementation order

1. Confirm **Database vs Storage** split in dashboard.  
2. **1A** — Throttle + shrink attendance and other pollers; remove `limit=5000` hot path.  
3. **1B** — Resized WebP (or similar) on upload + cache headers.  
4. Tuning: signed-URL cache, `next/image` for avatars, legacy image migration if still high.

### Phase 1 — Todos (egress)

- [ ] Verify Supabase usage: **Database vs Storage**  
- [ ] Refactor: dashboard attendance query + **global** poll throttling (hidden tab, longer interval)  
- [ ] `sharp` (or equivalent) on profile upload; WebP + max dimension + `cacheControl` on Storage  
- [ ] (Optional) Narrow Prisma selects / pagination on hot list APIs  
- [ ] (Optional) Reprocess or migrate large existing `profileImageUrl` objects in Storage  

---

## Phase 2: Other (after egress, or in parallel if time permits)

These are **separate** from the Supabase **egress** cap unless you change where files are hosted.

### Inactivity pause (free tier)

- Supabase can **pause** an idle free project; that is **not** the same as hitting the **egress** limit.  
- **Mitigation:** optional scheduled `curl`/uptime to a **production** URL that performs a **small DB read**; see [inactivity / heartbeat detail](#inactivity-pause--heartbeat-detail) below.

### Background / landing images in `public/`

- Today they are served with the **web app** (e.g. Vercel), **not** from `supabase.co` — they do **not** add to **Supabase** egress.  
- Optimizing them helps **host** bandwidth and load speed, not the Supabase quota, unless you **move** those assets to **Storage** later.

### Inactivity pause + heartbeat (detail)

**What it is:** On the **Supabase free tier**, a project can be **paused** when it has no qualifying activity for a while (commonly on the order of **7 days of inactivity**, subject to Supabase’s current policy). A paused project stops accepting DB/Storage/Auth until you open the dashboard and restore it. This is **separate** from the egress cap — you can be under 5 GB and still be paused, or vice versa.

**How to reduce the chance of pause (without upgrading):**

- **Keep a tiny, scheduled “heartbeat”** that hits your app (or a minimal API route) **on a schedule** (e.g. every **24–48 hours**), and have that path perform **one small database read** (e.g. `SELECT 1` or a lightweight `count` you already use) so the project is clearly “in use.”  
  - **Options:** [UptimeRobot](https://uptimerobot.com/), [cron-job.org](https://cron-job.org), GitHub Actions `schedule` + `curl` to a `/api/health` (or similar) that touches the DB.  
- **Do not** rely on static-only page loads if they never hit the database.  
- **If paused:** restore from the **Supabase dashboard**, then set up a heartbeat.  

### Background / landing — Supabase vs hosting (detail)

**In this repo, hero/backgrounds are from `public/`** (e.g. `app/page.tsx` `url('/landing%20image.jpg')`, `app/client/dashboard/page.tsx` uses `/model%201.jpg`, etc.) — they **do not** add to **Supabase** egress. **If** you put those same files in **Storage**, they would.  

**Worth doing for hosting/speed (optional):** compress/resize in `public/` to WebP, one shared file where login/forgot/reset all use the same asset, optional `next/image` later.

### Phase 2 — Todos (non-egress)

- [ ] (Optional) Heartbeat to production URL that touches DB; document in runbook  
- [ ] (Optional) Compress `public` hero/background assets (host bandwidth / UX, not Supabase egress)  

---

## Reference: image optimization details (Storage)

- Resize + **WebP** on upload, **`cacheControl`** on object, optional signed-URL cache, `next/image`, one-time cleanup of old large avatars — same as **Phase 1B** above. Full bullet list is covered there.
