-- Link Payment rows to AddOnSubscription for tracked locker/Wi‑Fi/other renewals
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "addOnSubscriptionId" TEXT;

CREATE INDEX IF NOT EXISTS "Payment_addOnSubscriptionId_idx" ON "Payment"("addOnSubscriptionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Payment_addOnSubscriptionId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_addOnSubscriptionId_fkey"
      FOREIGN KEY ("addOnSubscriptionId") REFERENCES "AddOnSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
