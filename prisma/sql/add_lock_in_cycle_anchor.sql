-- Optional: run on PostgreSQL if you apply SQL migrations manually.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockInCycleAnchorAt" TIMESTAMP(3);
