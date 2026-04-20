# Deploy Guide: Vercel + Namecheap + Supabase

This guide is for publishing FitnessHood on a real domain cheaply.

## Architecture (Recommended)

- **App hosting**: Vercel
- **Database**: Supabase Postgres
- **Domain**: Namecheap

This matches the current Next.js + Prisma + NextAuth stack with minimal risk.

---

## 1) Prepare repository

1. Push the latest project to GitHub.
2. Keep local/offline `.env` and `.env.local` for gym-PC mode.
3. Use `.env.production.example` as the variable reference for Vercel.
4. Ensure `.env` is gitignored and never committed.

---

## 2) Prepare Supabase (Production DB)

1. Open Supabase project.
2. Go to **Settings -> Database -> Connection string**.
3. Copy:
   - **Pooler URI (6543)** for `DATABASE_URL` (runtime/serverless-safe)
   - **Direct URI (5432)** for `DIRECT_URL` (schema changes/migrations from local machine)
4. In your local machine, temporarily point env vars to Supabase and run schema sync:
   - `DATABASE_URL=<pooler-uri>`
   - `DIRECT_URL=<direct-uri>`
   - then run `npm run db:push`
5. Seed only if you need initial data/admin:
   - `npm run db:seed`
6. For member forgot-password support, ensure reset fields exist:
   - run `prisma/sql/add_member_password_reset_fields.sql` in Supabase SQL Editor (or use `prisma db push` when connection allows).

> Important: use production DB credentials only in Vercel env vars (never in frontend code).

---

## 3) Deploy to Vercel

1. Log in to [Vercel](https://vercel.com/).
2. Click **Add New -> Project** and import the GitHub repo.
3. In **Environment Variables**, add:
   - `DATABASE_URL`
   - `DIRECT_URL` (recommended)
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (temporary Vercel URL first, then your custom domain later)
   - `NEXT_PUBLIC_APP_URL` (base URL for password reset links)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_PROFILE_BUCKET` (example: `profile-images`)
   - `RESEND_API_KEY`
   - `MAIL_FROM` (verified sender like `FitnessHood <no-reply@your-domain.com>`)
4. Deploy.

After first deploy, open the Vercel URL and verify login works.

### Supabase Storage setup (for profile images)

1. In Supabase -> **Storage**, create bucket `profile-images`.
2. Set bucket to **Public** (or add a read policy if private setup is preferred).
3. App upload route stores image files to this bucket and saves the public URL in `User.profileImageUrl`.

---

## 4) Connect Namecheap domain

### In Vercel
1. Open project -> **Settings -> Domains**.
2. Add your domain:
   - `your-domain.com`
   - `www.your-domain.com` (optional)
3. Vercel will show the DNS records you need.

### In Namecheap DNS
1. Open **Domain List -> Manage -> Advanced DNS**.
2. Add records exactly as Vercel instructs (usually):
   - `A` record for root (`@`) to Vercel IP
   - `CNAME` for `www` to Vercel target
3. Save changes and wait for DNS propagation.

---

## 5) Finalize auth URL

After domain is connected:

1. Set in Vercel:
   - `NEXTAUTH_URL=https://your-domain.com`
2. Redeploy once.

---

## 6) Production checks (must pass)

1. `https://your-domain.com/login` opens.
2. Admin can login.
3. Register user works.
4. Scan attendance works.
5. Attendance pages load and filters work.
6. Dashboard stats update after scans.
7. Export works.

---

## GitHub + Vercel command flow (quick)

1. Create repo in GitHub, then run locally:
   - `git init` (if needed)
   - `git add .`
   - `git commit -m "Prepare production deploy on Supabase + Vercel"`
   - `git branch -M master`
   - `git remote add origin <your-github-repo-url>`
   - `git push -u origin master`
2. Import the same repo in Vercel and set env vars from `.env.production.example`.

---

## 7) Google discoverability ("searchable link")

1. Ensure site is accessible publicly over HTTPS.
2. Submit domain to Google Search Console.
3. Do not block indexing (`robots` / `noindex`) unless intended.

---

## 8) Cost control tips

- Start on Vercel free tier.
- Start on Supabase free tier.
- Upgrade only when traffic/data grows.
- Keep logs/monitoring simple first.

---

## 9) Keep offline mode separately

This repo also supports local gym-PC mode using local PostgreSQL and Windows scripts.

- Online production mode (this guide): Vercel + Supabase
- Offline local mode: `scripts/windows/*` with local DB

Use one mode per deployment to avoid confusion.

