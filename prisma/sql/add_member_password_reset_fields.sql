ALTER TABLE public."User"
  ADD COLUMN IF NOT EXISTS "resetPasswordTokenHash" text,
  ADD COLUMN IF NOT EXISTS "resetPasswordExpiresAt" timestamptz;

