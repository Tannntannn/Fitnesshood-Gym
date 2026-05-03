CREATE TABLE IF NOT EXISTS "LoyaltyLedger" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "paymentId" TEXT,
  "points" INTEGER NOT NULL,
  "reason" VARCHAR(80) NOT NULL,
  "amountBasis" DECIMAL(10,2),
  "rewardUsed" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyLedger_userId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyLedger"
      ADD CONSTRAINT "LoyaltyLedger_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyLedger_paymentId_fkey'
  ) THEN
    ALTER TABLE "LoyaltyLedger"
      ADD CONSTRAINT "LoyaltyLedger_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "LoyaltyLedger_userId_createdAt_idx"
  ON "LoyaltyLedger" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "LoyaltyLedger_paymentId_idx"
  ON "LoyaltyLedger" ("paymentId");

