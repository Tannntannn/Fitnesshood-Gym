-- Penalty flag for Silver/Gold/Platinum when monthly period ended and contract balance remains.
CREATE TYPE "MembershipPenaltySource" AS ENUM ('AUTO', 'MANUAL');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "membershipPenalty" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "membershipPenaltySource" "MembershipPenaltySource";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "membershipPenaltyNotes" TEXT;
