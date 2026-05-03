CREATE TABLE IF NOT EXISTS "ClientAnnouncement" (
  "id" TEXT PRIMARY KEY,
  "title" VARCHAR(180) NOT NULL,
  "message" TEXT NOT NULL,
  "imageUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "ClientAnnouncement"
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

CREATE INDEX IF NOT EXISTS "ClientAnnouncement_isActive_startsAt_endsAt_idx"
  ON "ClientAnnouncement" ("isActive", "startsAt", "endsAt");

CREATE INDEX IF NOT EXISTS "ClientAnnouncement_updatedAt_idx"
  ON "ClientAnnouncement" ("updatedAt");

