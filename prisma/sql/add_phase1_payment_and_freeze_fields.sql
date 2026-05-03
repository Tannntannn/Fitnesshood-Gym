ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "freezeStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "freezeEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "freezeDaysTotal" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentTransactionType') THEN
    CREATE TYPE "PaymentTransactionType" AS ENUM (
      'LEGACY',
      'MEMBERSHIP_CONTRACT',
      'MONTHLY_FEE',
      'WALK_IN',
      'ADD_ON',
      'OTHER'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentDiscountType') THEN
    CREATE TYPE "PaymentDiscountType" AS ENUM (
      'NONE',
      'PERCENT',
      'FIXED'
    );
  END IF;
END
$$;

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "transactionType" "PaymentTransactionType" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS "discountType" "PaymentDiscountType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "discountFixedAmount" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "discountReason" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedBy" VARCHAR(191),
  ADD COLUMN IF NOT EXISTS "recordedBy" VARCHAR(191);

-- Backfill transaction type using existing service names.
UPDATE "Payment" p
SET "transactionType" = CASE
  WHEN s."name" = 'Membership' THEN 'MEMBERSHIP_CONTRACT'::"PaymentTransactionType"
  ELSE 'OTHER'::"PaymentTransactionType"
END
FROM "Service" s
WHERE p."serviceId" = s."id"
  AND p."transactionType" = 'LEGACY'::"PaymentTransactionType";

-- Backfill discount type from existing discount columns.
UPDATE "Payment"
SET "discountType" = CASE
  WHEN COALESCE("discountFixedAmount", 0) > 0 THEN 'FIXED'::"PaymentDiscountType"
  WHEN COALESCE("discountPercent", 0) > 0 OR COALESCE("discountAmount", 0) > 0 THEN 'PERCENT'::"PaymentDiscountType"
  ELSE 'NONE'::"PaymentDiscountType"
END
WHERE "discountType" = 'NONE'::"PaymentDiscountType";

CREATE INDEX IF NOT EXISTS "Payment_transactionType_paidAt_idx"
  ON "Payment" ("transactionType", "paidAt");

