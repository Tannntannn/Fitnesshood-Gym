/** Mirrors Payments page `filteredSalesRecords` date logic (local calendar). */

export type SalesFilterPeriod = "TODAY" | "WEEKLY" | "MONTHLY" | "ANNUALLY";

export type SalesFilterInput = {
  salesSpecificDate: string;
  salesFilterPeriod: SalesFilterPeriod;
  salesFilterYear: number;
  salesMonthFrom: number;
  salesMonthTo: number;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/**
 * Inclusive `paidAt` range for DB queries, aligned with customer payment sales filters.
 */
export function getSalesFilterPaidAtRange(input: SalesFilterInput, now: Date = new Date()): { start: Date; end: Date } {
  const parseDate = (value: string) => {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  if (input.salesSpecificDate.trim()) {
    const selected = parseDate(input.salesSpecificDate);
    return { start: startOfDay(selected), end: endOfDay(selected) };
  }

  if (input.salesFilterPeriod === "TODAY") {
    const base = startOfDay(now);
    return { start: base, end: endOfDay(base) };
  }

  if (input.salesFilterPeriod === "WEEKLY") {
    const todayOnly = startOfDay(now);
    const day = todayOnly.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(todayOnly);
    weekStart.setDate(weekStart.getDate() + diffToMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return { start: startOfDay(weekStart), end: endOfDay(weekEnd) };
  }

  if (input.salesFilterPeriod === "MONTHLY") {
    const startMonth = Math.min(input.salesMonthFrom, input.salesMonthTo);
    const endMonth = Math.max(input.salesMonthFrom, input.salesMonthTo);
    const start = new Date(input.salesFilterYear, startMonth - 1, 1);
    const end = new Date(input.salesFilterYear, endMonth, 0, 23, 59, 59, 999);
    return { start, end };
  }

  const start = new Date(input.salesFilterYear, 0, 1);
  const end = new Date(input.salesFilterYear, 11, 31, 23, 59, 59, 999);
  return { start, end };
}
