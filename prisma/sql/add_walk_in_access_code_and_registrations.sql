-- Walk-in access code + registration approval flow
-- Run this in Supabase SQL Editor (or your Postgres DB) once.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'WalkInRegistrationStatus' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "WalkInRegistrationStatus" AS ENUM ('REGISTERED', 'APPROVED', 'DECLINED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "WalkInAccessCode" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalkInAccessCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WalkInAccessCode_code_key" ON "WalkInAccessCode"("code");
CREATE INDEX IF NOT EXISTS "WalkInAccessCode_isActive_createdAt_idx" ON "WalkInAccessCode"("isActive", "createdAt");

CREATE TABLE IF NOT EXISTS "WalkInRegistration" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "contactNo" TEXT NOT NULL DEFAULT '',
  "address" TEXT,
  "notes" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'WALK_IN',
  "profileImageUrl" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" "WalkInRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
  "accessCodeId" TEXT NOT NULL,
  "reviewedBy" VARCHAR(191),
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalkInRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WalkInRegistration_createdUserId_key" ON "WalkInRegistration"("createdUserId");
CREATE INDEX IF NOT EXISTS "WalkInRegistration_status_createdAt_idx" ON "WalkInRegistration"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WalkInRegistration_email_status_idx" ON "WalkInRegistration"("email", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WalkInRegistration_accessCodeId_fkey'
  ) THEN
    ALTER TABLE "WalkInRegistration"
    ADD CONSTRAINT "WalkInRegistration_accessCodeId_fkey"
    FOREIGN KEY ("accessCodeId") REFERENCES "WalkInAccessCode"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WalkInRegistration_createdUserId_fkey'
  ) THEN
    ALTER TABLE "WalkInRegistration"
    ADD CONSTRAINT "WalkInRegistration_createdUserId_fkey"
    FOREIGN KEY ("createdUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
