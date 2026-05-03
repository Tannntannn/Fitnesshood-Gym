-- Removes guest promo-code walk-in access (WalkInPass depends on WalkInAccessCode).
DROP TABLE IF EXISTS "WalkInPass";
DROP TABLE IF EXISTS "WalkInAccessCode";
