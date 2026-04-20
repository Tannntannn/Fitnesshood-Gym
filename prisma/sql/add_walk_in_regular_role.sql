-- Run in Supabase SQL Editor once, then run: npx prisma generate
-- Adds Walk-in (Regular) to the same enum used by Prisma (`UserRole`).

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'WALK_IN_REGULAR';
