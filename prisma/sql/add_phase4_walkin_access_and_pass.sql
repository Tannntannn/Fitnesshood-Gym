CREATE TABLE IF NOT EXISTS "WalkInAccessCode" (
  "id" TEXT PRIMARY KEY,
  "code" VARCHAR(40) NOT NULL UNIQUE,
  "label" VARCHAR(120),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "maxUses" INTEGER NOT NULL DEFAULT 1,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "WalkInPass" (
  "id" TEXT PRIMARY KEY,
  "accessCodeId" TEXT NOT NULL,
  "firstName" VARCHAR(80) NOT NULL,
  "lastName" VARCHAR(80) NOT NULL,
  "contactNo" VARCHAR(40),
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WalkInAccessCode_createdByAdminId_fkey'
  ) THEN
    ALTER TABLE "WalkInAccessCode"
      ADD CONSTRAINT "WalkInAccessCode_createdByAdminId_fkey"
      FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WalkInPass_accessCodeId_fkey'
  ) THEN
    ALTER TABLE "WalkInPass"
      ADD CONSTRAINT "WalkInPass_accessCodeId_fkey"
      FOREIGN KEY ("accessCodeId") REFERENCES "WalkInAccessCode"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "WalkInAccessCode_isActive_expiresAt_idx"
  ON "WalkInAccessCode" ("isActive", "expiresAt");

CREATE INDEX IF NOT EXISTS "WalkInPass_accessCodeId_createdAt_idx"
  ON "WalkInPass" ("accessCodeId", "createdAt");

CREATE INDEX IF NOT EXISTS "WalkInPass_status_validUntil_idx"
  ON "WalkInPass" ("status", "validUntil");

