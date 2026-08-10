import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const revalidate = 0;

/* ── helpers ─────────────────────────────────────────────── */

function getWeekBounds(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function getMonthBounds(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  return start.toISOString().slice(0, 10);
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function pct(num: number, den: number) {
  if (den === 0) return null;
  return Math.round((num / den) * 100);
}

function PctBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300 text-sm">—</span>;
  const color =
    value >= 80
      ? { bg: "#dcfce7", text: "#166534" }
      : value >= 60
      ? { bg: "#fef9c3", text: "#854d0e" }
      : { bg: "#fee2e2", text: "#991b1b" };
  return (
    <span
      style={{
        background: color.bg,
        color: color.text,
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 700,
      }}
    >
      {value}%
    </span>
  );
}

type SP = {
  period?: string;
  groupId?: string;
  dateFrom?: string;
  dateTo?: string;
  month?: string;
};

/* ── page ─────────────────────────────────────────────────── */

export default async function TeacherReportsPage(props: { searchParams?: Promise<SP> }) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const teacher = await prisma.user.findUnique({ where: { id: userId } });
  if (!teacher || teacher.role !== "TEACHER") redirect("/login");

  const sp = props.searchParams ? await props.searchParams : {};
  const period = sp.period || "month";
  const groupIdFilter = sp.groupId || "";
  const month = sp.month || currentYYYYMM();
  const dateFrom = sp.dateFrom || currentWeekStart();
  const dateTo = sp.dateTo || new Date().toISOString().slice(0, 10);

  // Compute date bounds
  let start: Date, end: Date;
  if (period === "week") {
    const bounds = getWeekBounds(new Date(dateFrom));
    start = bounds.start;
    end = bounds.end;
  } else if (period === "month") {
    const bounds = getMonthBounds(month);
    start = bounds.start;
    end = bounds.end;
  } else {
    // custom
    start = new Date(dateFrom + "T00:00:00");
    end = new Date(dateTo + "T23:59:59");
  }

  const startKey = start.toISOString().slice(0, 10);
  const endKey = end.toISOString().slice(0, 10);

  const myGroups = await prisma.group.findMany({
    where: { teacherId: userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const groupIds = groupIdFilter
    ? [groupIdFilter]
    : myGroups.map((g) => g.id);

  // All students in filtered groups
  const students = await prisma.student.findMany({
    where: { groups: { some: { id: { in: groupIds } } } },
    select: { id: true, name: true, groups: { where: { id: { in: groupIds } }, select: { name: true } } },
    orderBy: { name: "asc" },
  });

  // Reports in period for this teacher
  const reports = await prisma.report.findMany({
    where: {
      teacherId: userId,
      groupId: groupIdFilter ? groupIdFilter : { in: groupIds },
      dateKey: { gte: startKey, lte: endKey },
    },
    select: { studentId: true, attendance: true, homework: true, dateKey: true },
  });

  // Build per-student stats
  const reportsByStudent = new Map<string, typeof reports>();
  for (const r of reports) {
    if (!reportsByStudent.has(r.studentId)) reportsByStudent.set(r.studentId, []);
    reportsByStudent.get(r.studentId)!.push(r);
  }

  const rows = students.map((s) => {
    const sReports = reportsByStudent.get(s.id) ?? [];
    const total = sReports.length;
    const present = sReports.filter((r) => r.attendance === "PRESENT").length;
    const hwDone = sReports.filter((r) => r.homework === "DONE").length;
    const hwPartial = sReports.filter((r) => r.homework === "PARTIAL").length;
    return {
      id: s.id,
      name: s.name,
      group: s.groups[0]?.name ?? "—",
      total,
      present,
      absent: total - present,
      hwDone,
      hwPartial,
      attendancePct: pct(present, total),
      hwPct: pct(hwDone + hwPartial, total),
    };
  });

  const avgAttendance = pct(
    rows.reduce((s, r) => s + r.present, 0),
    rows.reduce((s, r) => s + r.total, 0)
  );
  const avgHw = pct(
    rows.reduce((s, r) => s + r.hwDone + r.hwPartial, 0),
    rows.reduce((s, r) => s + r.total, 0)
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Attendance & homework stats per student</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <form method="GET" className="flex flex-wrap gap-3 items-end">

          {/* Period type */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Period</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden h-10">
              {["week", "month", "custom"].map((p) => (
                <button
                  key={p}
                  type="submit"
                  name="period"
                  value={p}
                  className="px-4 text-sm font-medium transition"
                  style={
                    period === p
                      ? { background: "#111827", color: "#fff" }
                      : { background: "#fff", color: "#6b7280" }
                  }
                >
                  {p === "week" ? "Week" : p === "month" ? "Month" : "Custom"}
                </button>
              ))}
            </div>
          </div>

          {/* Month picker */}
          {period === "month" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Month</label>
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}

          {/* Week picker */}
          {period === "week" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Week starting</label>
              <input
                type="date"
                name="dateFrom"
                defaultValue={dateFrom}
                className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}

          {/* Custom range */}
          {period === "custom" && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">From</label>
                <input type="date" name="dateFrom" defaultValue={dateFrom} className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">To</label>
                <input type="date" name="dateTo" defaultValue={dateTo} className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </>
          )}

          {/* Group filter */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Group</label>
            <select
              name="groupId"
              defaultValue={groupIdFilter}
              className="h-10 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All groups</option>
              {myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          {/* Hidden fields to preserve state */}
          <input type="hidden" name="period" value={period} />
          <button
            type="submit"
            className="h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition"
          >
            Apply
          </button>
        </form>

        {/* Period label */}
        <p className="text-xs text-gray-400 mt-3">
          Showing: <span className="font-semibold text-gray-600">{fmtDate(startKey)} — {fmtDate(endKey)}</span>
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold text-gray-900">{students.length}</p>
          <p className="text-xs text-gray-400 mt-1 font-semibold uppercase tracking-wide">Students</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold" style={{ color: avgAttendance !== null && avgAttendance >= 80 ? "#166534" : avgAttendance !== null && avgAttendance >= 60 ? "#854d0e" : "#991b1b" }}>
            {avgAttendance !== null ? `${avgAttendance}%` : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1 font-semibold uppercase tracking-wide">Avg Attendance</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold" style={{ color: avgHw !== null && avgHw >= 80 ? "#166534" : avgHw !== null && avgHw >= 60 ? "#854d0e" : "#991b1b" }}>
            {avgHw !== null ? `${avgHw}%` : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1 font-semibold uppercase tracking-wide">Avg Homework</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "700px" }}>
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">Group</th>
                <th className="px-6 py-3 text-center">Lessons</th>
                <th className="px-6 py-3 text-center">Present</th>
                <th className="px-6 py-3 text-center">Absent</th>
                <th className="px-6 py-3 text-center">Attendance</th>
                <th className="px-6 py-3 text-center">Homework</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">
                    No reports found for this period.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-semibold text-gray-900">{row.name}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{row.group}</td>
                    <td className="px-6 py-3 text-center text-gray-600">{row.total || "—"}</td>
                    <td className="px-6 py-3 text-center">
                      {row.total > 0 ? <span className="text-green-600 font-semibold">{row.present}</span> : "—"}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {row.total > 0 ? <span className={row.absent > 0 ? "text-red-500 font-semibold" : "text-gray-400"}>{row.absent}</span> : "—"}
                    </td>
                    <td className="px-6 py-3 text-center"><PctBadge value={row.attendancePct} /></td>
                    <td className="px-6 py-3 text-center"><PctBadge value={row.hwPct} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
            🟢 ≥80% · 🟡 60–79% · 🔴 &lt;60%
          </div>
        )}
      </div>
    </div>
  );
}