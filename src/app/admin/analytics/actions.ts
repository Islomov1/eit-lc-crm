"use server";

import { prisma } from "@/lib/prisma";

/* ── helpers ─────────────────────────────────────────────── */

function monthWindow(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

function dateKeyRange(year: number, month: number) {
  const y = String(year);
  const m = String(month).padStart(2, "0");
  const startKey = `${y}-${m}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endKey = `${String(nextYear)}-${String(nextMonth).padStart(2, "0")}-01`;
  return { startKey, endKey };
}

/* ── main ────────────────────────────────────────────────── */

export async function getAnalyticsData(monthStr: string, year: number) {
  const [y, m] = monthStr.split("-").map(Number);
  if (!y || !m) throw new Error("Invalid month format");

  const { start: monthStart, end: monthEnd } = monthWindow(y, m);
  const { startKey, endKey } = dateKeyRange(y, m);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const [
    reports,
    yearPayments,
    allActiveStudents,
    paidThisMonth,
    teachers,
    teacherReports,
    totalStudents,
    totalGroups,
    monthRevenueAgg,
  ] = await Promise.all([
    // 1. Reports for selected month
    prisma.report.findMany({
      where: { dateKey: { gte: startKey, lt: endKey } },
      select: { attendance: true, groupId: true, group: { select: { name: true } } },
    }),

    // 2. Year payments for revenue chart
    prisma.payment.findMany({
      where: {
        periodStart: { gte: yearStart, lt: yearEnd },
        status: { in: ["PAID", "PARTIAL"] },
      },
      select: { periodStart: true, amount: true },
    }),

    // 3. All active students (in at least one group) ✅
    prisma.student.findMany({
      where: { groups: { some: {} } },
      select: {
        id: true,
        name: true,
        groups: {
          select: { name: true, teacher: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),

    // 4. Paid students this month
    prisma.payment.findMany({
      where: { periodStart: monthStart, status: { in: ["PAID", "PARTIAL"] } },
      select: { studentId: true, amount: true },
    }),

    // 5. Teachers list
    prisma.user.findMany({
      where: { role: "TEACHER" },
      select: { id: true, name: true },
    }),

    // 6. Teacher reports this month
    prisma.report.findMany({
      where: { dateKey: { gte: startKey, lt: endKey } },
      select: { teacherId: true, attendance: true, homework: true },
    }),

    // 7. Total students ✅
    prisma.student.count({ where: { groups: { some: {} } } }),

    // 8. Active groups
    prisma.group.count({ where: { status: { in: ["ACTIVE", "NEW"] } } }),

    // 9. Month revenue
    prisma.payment.aggregate({
      where: { periodStart: monthStart, status: { in: ["PAID", "PARTIAL"] } },
      _sum: { amount: true },
    }),
  ]);

  // ── 1. Attendance by group ────────────────────────────────
  const groupMap = new Map<string, { name: string; present: number; absent: number }>();
  for (const r of reports) {
    const existing = groupMap.get(r.groupId) ?? { name: r.group?.name ?? r.groupId, present: 0, absent: 0 };
    if (r.attendance === "PRESENT") existing.present++;
    else existing.absent++;
    groupMap.set(r.groupId, existing);
  }

  const attendanceByGroup = Array.from(groupMap.values()).map((g) => ({
    name: g.name,
    present: g.present,
    absent: g.absent,
    rate: g.present + g.absent > 0 ? Math.round((g.present / (g.present + g.absent)) * 100) : 0,
  }));

  // ── 2. Revenue by month (full year) ──────────────────────
  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
    const label = new Date(year, i, 1).toLocaleString("en", { month: "short" });
    const total = yearPayments
      .filter((p) => p.periodStart.getMonth() === i && p.periodStart.getFullYear() === year)
      .reduce((s, p) => s + p.amount, 0);
    return { month: label, monthIndex: i, amount: total };
  });

  const yearTotalRevenue = yearPayments.reduce((s, p) => s + p.amount, 0);

  // ── 3. Unpaid students ✅ ─────────────────────────────────
  const paidSet = new Set(paidThisMonth.map((p) => p.studentId));
  const unpaidStudents = allActiveStudents
    .filter((s) => !paidSet.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      group: s.groups[0]?.name ?? "—",
      teacher: s.groups[0]?.teacher?.name ?? "—",
    }));

  // ── 4. Teacher KPI ────────────────────────────────────────
  const teacherKpi = teachers.map((t) => {
    const tReports = teacherReports.filter((r) => r.teacherId === t.id);
    const total = tReports.length;
    const present = tReports.filter((r) => r.attendance === "PRESENT").length;
    const hwDone = tReports.filter((r) => r.homework === "DONE").length;
    const hwPartial = tReports.filter((r) => r.homework === "PARTIAL").length;

    return {
      id: t.id,
      name: t.name,
      totalReports: total,
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
      hwDoneRate: total > 0 ? Math.round(((hwDone + hwPartial) / total) * 100) : 0,
    };
  });

  return {
    month: monthStr,
    year,
    summary: {
      totalStudents,
      totalGroups,
      monthRevenue: monthRevenueAgg._sum.amount ?? 0,
      yearRevenue: yearTotalRevenue,
      unpaidCount: unpaidStudents.length,
    },
    attendanceByGroup,
    monthlyRevenue,
    unpaidStudents,
    teacherKpi,
  };
}