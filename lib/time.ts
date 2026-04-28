export const PH_TIMEZONE = "Asia/Manila";

export function nowInPH(): Date {
  // Keep the true current timestamp; apply PH timezone only when formatting/deriving calendar fields.
  return new Date();
}

export function getDateOnlyPH(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  // Persist the exact instant of PH midnight for stable date comparisons in DB.
  return new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
}

export function formatPHTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PH_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function getPHCalendarParts(date: Date): { weekday: string; month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PH_TIMEZONE,
    weekday: "long",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  return {
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    month: Number(parts.find((part) => part.type === "month")?.value ?? "0"),
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
  };
}
