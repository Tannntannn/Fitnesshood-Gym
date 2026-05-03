-- One-time custom add-on label on payments (admin POS).
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "customAddOnLabel" VARCHAR(200);

-- Canonical service row for manual add-on price/name (all roles via tier ALL + contractMonths 0).
INSERT INTO "Service" ("id", "name", "tier", "contractMonths", "monthlyRate", "membershipFee", "contractPrice", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Add-on', 'Custom', 0, 0, 0, 0, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Service" WHERE "name" = 'Add-on' AND "tier" = 'Custom');
