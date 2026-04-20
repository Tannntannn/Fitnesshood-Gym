import { format } from "date-fns";

export const PH_TIMEZONE = "Asia/Manila";

export function nowInPH(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: PH_TIMEZONE }));
}

export function getDateOnlyPH(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatPHTime(date: Date): string {
  return format(date, "hh:mm a");
}
