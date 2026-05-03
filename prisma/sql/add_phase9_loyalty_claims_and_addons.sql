DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LoyaltyApprovalStatus') THEN
    CREATE TYPE "LoyaltyApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

ALTER TABLE "LoyaltyLedger" ADD COLUMN IF NOT EXISTS "pointsEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LoyaltyLedger" ADD COLUMN IF NOT EXISTS "pointsDeducted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LoyaltyLedger" ADD COLUMN IF NOT EXISTS "remainingBalance" INTEGER;
ALTER TABLE "LoyaltyLedger" ADD COLUMN IF NOT EXISTS "reasonDetail" TEXT;
ALTER TABLE "LoyaltyLedger" ADD COLUMN IF NOT EXISTS "transactionReference" VARCHAR(120);
ALTER TABLE "LoyaltyLedger" ADD COLUMN IF NOT EXISTS "adminApproval" "LoyaltyApprovalStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "LoyaltyLedger" ADD COLUMN IF NOT EXISTS "adjustedBy" VARCHAR(191);
ALTER TABLE "LoyaltyLedger" ADD COLUMN IF NOT EXISTS "adjustedAt" TIMESTAMP(3);
ALTER TABLE "LoyaltyLedger" ADD COLUMN IF NOT EXISTS "claimId" TEXT;

CREATE TABLE IF NOT EXISTS "LoyaltyClaim" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "rewardName" VARCHAR(120) NOT NULL,
  "pointsRequired" INTEGER NOT NULL,
  "status" "LoyaltyApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvedBy" VARCHAR(191),
  "approvedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyClaim_userId_fkey') THEN
    ALTER TABLE "LoyaltyClaim"
      ADD CONSTRAINT "LoyaltyClaim_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyLedger_claimId_fkey') THEN
    ALTER TABLE "LoyaltyLedger"
      ADD CONSTRAINT "LoyaltyLedger_claimId_fkey"
      FOREIGN KEY ("claimId") REFERENCES "LoyaltyClaim"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LoyaltyClaim_userId_createdAt_idx" ON "LoyaltyClaim"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "LoyaltyClaim_status_createdAt_idx" ON "LoyaltyClaim"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "LoyaltyLedger_claimId_idx" ON "LoyaltyLedger"("claimId");

CREATE TABLE IF NOT EXISTS "AddOnSubscription" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "serviceId" TEXT,
  "addonName" VARCHAR(120) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "lastPaymentAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AddOnSubscription_userId_fkey') THEN
    ALTER TABLE "AddOnSubscription"
      ADD CONSTRAINT "AddOnSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AddOnSubscription_serviceId_fkey') THEN
    ALTER TABLE "AddOnSubscription"
      ADD CONSTRAINT "AddOnSubscription_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AddOnSubscription_userId_status_idx" ON "AddOnSubscription"("userId", "status");
CREATE INDEX IF NOT EXISTS "AddOnSubscription_dueDate_idx" ON "AddOnSubscription"("dueDate");
