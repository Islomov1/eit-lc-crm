import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReportsClient } from "@/components/ReportsClient";

export const revalidate = 0;

function getMonthBounds(yyyymm: string) {
  const [y, m] = yyyymm.split("-").map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function toKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

type SP = { period?: string; groupId?: string; dateFrom?: string; dateTo?: string; month?: string };

export default async function TeacherReportsPage(props: { searchParams?: Promise<SP> }) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const teacher = await prisma.user.findUnique({ where: { id: userId } });
  if (!teacher || teacher.role !== "TEACHER") redirect("/login");

  const sp = props.searchParams ? await props.searchParams : {};
  const period = (sp.period || "month") as "week" | "month" | "custom";
  const groupIdFilter = sp.groupId || "";
  const month = sp.month || currentYYYYMM();
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = sp.dateFrom || currentWeekStart();
  const dateTo = sp.dateTo || today;

  // Compute date range
  let start: Date, end: Date;
  if (period === "week") {
    const d = new Date(dateFrom + "T00:00:00");
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    start = new Date(d);
    end = new Date(d);
    end.setDate(end.getDate() + 7);
  } else if (period === "month") {
    const b = getMonthBounds(month);
    start = b.start; end = b.end;
  } else {
    start = new Date(dateFrom + "T00:00:00");
    end = new Date(dateTo + "T23:59:59");
  }

  const startKey = toKey(start);
  const endKey = toKey(end);

  const myGroups = await prisma.group.findMany({
    where: { teacherId: userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const groupIds = groupIdFilter ? [groupIdFilter] : myGroups.map((g) => g.id);

  const [students, reports] = await Promise.all([
    prisma.student.findMany({
      where: { groups: { some: { id: { in: groupIds } } } },
      select: { id: true, name: true, groups: { where: { id: { in: groupIds } }, select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.report.findMany({
      where: {
        teacherId: userId,
        groupId: groupIdFilter ? groupIdFilter : { in: groupIds },
        dateKey: { gte: startKey, lte: endKey },
      },
      select: { studentId: true, attendance: true, homework: true, dateKey: true },
    }),
  ]);

  const reportsByStudent = new Map<string, typeof reports>();
  for (const r of reports) {
    if (!reportsByStudent.has(r.studentId)) reportsByStudent.set(r.studentId, []);
    reportsByStudent.get(r.studentId)!.push(r);
  }

  const rows = students.map((s) => {
    const sr = reportsByStudent.get(s.id) ?? [];
    const total = sr.length;
    const present = sr.filter((r) => r.attendance === "PRESENT").length;
    const hwDone = sr.filter((r) => r.homework === "DONE").length;
    const hwPartial = sr.filter((r) => r.homework === "PARTIAL").length;
    const attendancePct = total > 0 ? Math.round((present / total) * 100) : null;
    const hwPct = total > 0 ? Math.round(((hwDone + hwPartial) / total) * 100) : null;
    return {
      id: s.id,
      name: s.name,
      group: s.groups[0]?.name ?? "—",
      total,
      present,
      absent: total - present,
      attendancePct,
      hwPct,
    };
  });

  return (
    <ReportsClient
      rows={rows}
      myGroups={myGroups}
      period={period}
      groupIdFilter={groupIdFilter}
      month={month}
      dateFrom={dateFrom}
      dateTo={dateTo}
      startKey={startKey}
      endKey={endKey}
    />
  );
}