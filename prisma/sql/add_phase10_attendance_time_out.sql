-- Phase 10: Attendance occupancy tracking (time-in / time-out)
ALTER TABLE "Attendance"
  ADD COLUMN IF NOT EXISTS "timeOut" TEXT,
  ADD COLUMN IF NOT EXISTS "checkedOutAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Attendance_date_timeOut_idx" ON "Attendance"("date", "timeOut");
CREATE INDEX IF NOT EXISTS "Attendance_userId_checkedOutAt_idx" ON "Attendance"("userId", "checkedOutAt");
