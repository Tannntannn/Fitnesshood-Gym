import type { Attendance, User } from "@prisma/client";

export type ApiErrorResponse = {
  success: false;
  error: string;
  details?: string;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type AttendanceWithUser = Attendance & {
  user: Pick<User, "firstName" | "lastName" | "address" | "role">;
};
