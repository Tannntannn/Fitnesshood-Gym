import { format } from "date-fns";
import type { AttendanceWithUser } from "@/types";
import { formatRoleLabel } from "@/lib/role-labels";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AttendanceTable({
  rows,
  onDelete,
}: {
  rows: AttendanceWithUser[];
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50/90">
          <TableRow>
            <TableHead className="px-4 py-3 font-semibold">#</TableHead>
            <TableHead className="px-4 py-3 font-semibold">First Name</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Last Name</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Address</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Role</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Date</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Day</TableHead>
            <TableHead className="px-4 py-3 font-semibold">Time In</TableHead>
            {onDelete ? <TableHead className="px-4 py-3 font-semibold">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item, index) => (
            <TableRow key={item.id} className="transition-colors hover:bg-slate-50">
              <TableCell className="px-4 py-3">{index + 1}</TableCell>
              <TableCell className="px-4 py-3">{item.user.firstName}</TableCell>
              <TableCell className="px-4 py-3">{item.user.lastName}</TableCell>
              <TableCell className="px-4 py-3 min-w-[240px]">{item.user.address ?? ""}</TableCell>
              <TableCell className="px-4 py-3">{formatRoleLabel(item.roleSnapshot)}</TableCell>
              <TableCell className="px-4 py-3 whitespace-nowrap">{format(new Date(item.date), "MMMM d, yyyy")}</TableCell>
              <TableCell className="px-4 py-3">{item.dayOfWeek}</TableCell>
              <TableCell className="px-4 py-3 whitespace-nowrap">{item.timeIn}</TableCell>
              {onDelete ? (
                <TableCell className="px-4 py-3">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="bg-red-600 hover:bg-red-600/90 shadow-sm"
                    onClick={() => onDelete(item.id)}
                  >
                    Delete
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={onDelete ? 9 : 8} className="px-4 py-8 text-center text-slate-500">
                No attendance records found.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
