import * as XLSX from "xlsx";
import { format } from "date-fns";
import type { UserRole } from "@prisma/client";
import type { AttendanceWithUser } from "@/types";
import { formatRoleLabel } from "@/lib/role-labels";

export function generateExcel(data: AttendanceWithUser[], sheetName: string): Buffer {
  const rows = data.map((item, index) => ({
    "#": index + 1,
    "First Name": item.user.firstName,
    "Last Name": item.user.lastName,
    Address: item.user.address,
    Role: formatRoleLabel(item.roleSnapshot as UserRole),
    Date: format(new Date(item.date), "MMMM d, yyyy"),
    Day: item.dayOfWeek,
    "Time In": item.timeIn,
    "Time Out": item.timeOut ?? "Inside",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 16 },
    { wch: 30 },
    { wch: 14 },
    { wch: 18 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
