-- Groups multi-line saves in Payment Records UI and enables combined receipt without changing accounting rows.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "receiptGroupId" VARCHAR(36);
