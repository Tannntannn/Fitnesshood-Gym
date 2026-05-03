-- Coach commission remittances (coach → gym). Run after Prisma enum "PaymentMethod" exists.
CREATE TABLE IF NOT EXISTS "CoachCommissionRemittance" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentReference" VARCHAR(255),
    "notes" TEXT,
    "recordedBy" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachCommissionRemittance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CoachCommissionRemittance_coachId_paidAt_idx"
  ON "CoachCommissionRemittance" ("coachId", "paidAt");

CREATE INDEX IF NOT EXISTS "CoachCommissionRemittance_paidAt_idx"
  ON "CoachCommissionRemittance" ("paidAt");

ALTER TABLE "CoachCommissionRemittance"
  DROP CONSTRAINT IF EXISTS "CoachCommissionRemittance_coachId_fkey";

ALTER TABLE "CoachCommissionRemittance"
  ADD CONSTRAINT "CoachCommissionRemittance_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "Coach" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
