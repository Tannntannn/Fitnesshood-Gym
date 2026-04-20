# FitnessHood — Gym PC Install (Best Option)

This app is designed to run on a **single gym computer** as a local website:

- Open in a browser at `http://localhost:3000`
- No “hosting” needed for daily use
- Best for a front-desk scan station + admin dashboard in one tab

## Requirements (Gym PC)

- **Windows 10/11**
- **Node.js LTS** installed
- **PostgreSQL** installed and running (local database for offline mode)

## Install (one-time)

1. Copy this entire project folder to the gym PC.
2. Double-click:
   - `scripts/windows/INSTALL_FITNESSHOOD.cmd`

This will:
- install dependencies
- generate Prisma client
- build the production app
- seed the default admin

## Start (daily use)

Double-click:
- `scripts/windows/START_FITNESSHOOD.cmd`

It will open `http://localhost:3000` and start the server.

## Auto-start on client PC (recommended)

After installation, run once:

- `scripts/windows/ENABLE_AUTOSTART.cmd`

This creates a Windows Task Scheduler entry so FitnessHood starts automatically when the client logs in.

To remove auto-start later:

- `scripts/windows/DISABLE_AUTOSTART.cmd`

## Offline mode + Supabase backup (recommended)

This project uses **local PostgreSQL** as the primary database so it works offline.

Optional: when WiFi is available, a background sync can upload new users/attendance to Supabase as a backup.

### Enable Supabase backup sync

1. In `.env.local`, set:

- `SUPABASE_SERVICE_ROLE_KEY`

2. Start the app with `START_FITNESSHOOD.cmd` (it starts the sync worker automatically).

## Notes

- If PowerShell blocks `npm` scripts, these `.cmd` files use `npm.cmd` so they still work.
- To stop the server: close the command window running the app.
- Data is retained even after closing/restarting because records are stored in local PostgreSQL.

## Publish Online (Domain)

If you want a public domain (Namecheap) + cheap hosting:

- Use **Vercel** for app hosting
- Use **Supabase Postgres** for production database

Deployment guide:

- `docs/DEPLOY_VERCEL_NAMECHEAP.md`
- `.env.production.example` (variables template for Vercel)

