-- Walk-in registration + access code feature
-- Run this in Supabase SQL Editor (or your Postgres client) once.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WalkInRegistrationStatus') THEN
    CREATE TYPE "WalkInRegistrationStatus" AS ENUM ('REGISTERED', 'APPROVED', 'DECLINED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "WalkInAccessCode" (
  "id" text PRIMARY KEY,
  "code" varchar(32) NOT NULL UNIQUE,
  "isActive" boolean NOT NULL DEFAULT true,
  "expiresAt" timestamptz NULL,
  "maxUses" integer NOT NULL DEFAULT 1,
  "usedCount" integer NOT NULL DEFAULT 0,
  "lastUsedAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "WalkInRegistration" (
  "id" text PRIMARY KEY,
  "firstName" text NOT NULL,
  "lastName" text NOT NULL,
  "email" text NOT NULL,
  "contactNo" text NOT NULL DEFAULT '',
  "address" text NULL,
  "notes" text NULL,
  "role" "UserRole" NOT NULL DEFAULT 'WALK_IN',
  "profileImageUrl" text NOT NULL,
  "passwordHash" text NOT NULL,
  "status" "WalkInRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
  "accessCodeId" text NOT NULL,
  "reviewedBy" varchar(191) NULL,
  "reviewedAt" timestamptz NULL,
  "reviewNotes" text NULL,
  "createdUserId" text NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "WalkInRegistration_accessCodeId_fkey"
    FOREIGN KEY ("accessCodeId") REFERENCES "WalkInAccessCode"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WalkInRegistration_createdUserId_fkey"
    FOREIGN KEY ("createdUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WalkInAccessCode_isActive_createdAt_idx"
  ON "WalkInAccessCode" ("isActive", "createdAt");

CREATE INDEX IF NOT EXISTS "WalkInRegistration_status_createdAt_idx"
  ON "WalkInRegistration" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "WalkInRegistration_email_status_idx"
  ON "WalkInRegistration" ("email", "status");

