import { prisma } from "./prisma";
import { dateKey } from "./format";
import { addDays, previousWeek } from "./lessons";
import { reportLanguage, weeklyMessage } from "./report-messages";
export type SummaryRow = {
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  expected: number;
  marked: number;
  present: number;
  done: number;
  partial: number;
  missing: number;
  legacy: number;
  topics: string[];
  comment: string | null;
};
export async function periodSummary(
  start: string,
  end: string,
  groupIds?: string[],
) {
  const [lessons, reports] = await Promise.all([
    prisma.lesson.findMany({
      where: {
        dateKey: { gte: start, lt: end },
        cancelledAt: null,
        ...(groupIds ? { groupId: { in: groupIds } } : {}),
      },
      include: {
        group: { select: { name: true } },
        students: { include: { student: { select: { name: true } } } },
      },
    }),
    prisma.report.findMany({
      where: {
        dateKey: { gte: start, lt: end },
        ...(groupIds ? { groupId: { in: groupIds } } : {}),
      },
      include: {
        student: { select: { name: true } },
        group: { select: { name: true } },
      },
      orderBy: { dateKey: "asc" },
    }),
  ]);
  const rows = new Map<string, SummaryRow>();
  const keys = new Set<string>();
  const get = (
    studentId: string,
    studentName: string,
    groupId: string,
    groupName: string,
  ) => {
    const key = studentId + ":" + groupId;
    if (!rows.has(key))
      rows.set(key, {
        studentId,
        studentName,
        groupId,
        groupName,
        expected: 0,
        marked: 0,
        present: 0,
        done: 0,
        partial: 0,
        missing: 0,
        legacy: 0,
        topics: [],
        comment: null,
      });
    return rows.get(key)!;
  };
  for (const l of lessons)
    for (const s of l.students) {
      // Do not count today's lesson until its scheduled end (Samarkand time).
      if (new Date(l.dateKey + "T" + l.endTime + ":00+05:00") > new Date())
        continue;
      get(s.studentId, s.student.name, l.groupId, l.group.name).expected++;
      keys.add(s.studentId + ":" + l.groupId + ":" + l.dateKey);
    }
  for (const r of reports) {
    const row = get(r.studentId, r.student.name, r.groupId, r.group.name);
    if (!keys.has(r.studentId + ":" + r.groupId + ":" + r.dateKey)) {
      row.expected++;
      row.legacy++;
    }
    row.marked++;
    if (r.attendance === "PRESENT") row.present++;
    if (r.homework === "DONE") row.done++;
    if (r.homework === "PARTIAL") row.partial++;
    if (r.topic && !row.topics.includes(r.topic)) row.topics.push(r.topic);
    if (r.comment) row.comment = r.comment;
  }
  for (const row of rows.values())
    row.missing = Math.max(0, row.expected - row.marked);
  return [...rows.values()].sort(
    (a, b) =>
      a.studentName.localeCompare(b.studentName) ||
      a.groupName.localeCompare(b.groupName),
  );
}
export async function queueWeeklyReports(now = new Date()) {
  const config = await prisma.reportAutomation.findUnique({
    where: { id: "parent-reports" },
  });
  if (!config?.enabled) return 0;
  const week = previousWeek(now);
  // Only a complete tracked week is eligible. No historical bulk mailing.
  if (week.start < config.trackingStartsOn) return 0;
  const rows = await periodSummary(week.start, week.next);
  const gaps = await trackingGaps(week.start, week.next);
  const parents = await prisma.parent.findMany({
    where: {
      weeklyReports: true,
      telegramId: { not: null },
      student: { archivedAt: null },
      studentId: { in: rows.map((r) => r.studentId) },
    },
  });
  const data = rows.flatMap((row) =>
    parents
      .filter((p) => p.studentId === row.studentId)
      .map((p) => ({
        studentId: p.studentId,
        parentId: p.id,
        chatId: p.telegramId!,
        messageText: weeklyMessage(
          {
            ...row,
            start: week.start,
            end: week.end,
            untracked: gaps.filter((g) => g.groupId === row.groupId).length,
          },
          reportLanguage(p.reportLanguage),
        ),
        sourceType: "WEEKLY_REPORT",
        sourceId: week.start,
        actorType: "SYSTEM",
        autoRetry: true,
        idempotencyKey: `WEEKLY:${p.studentId}:${row.groupId}:${week.start}`,
      })),
  );
  if (!data.length) return 0;
  return (
    await prisma.telegramDelivery.createMany({ data, skipDuplicates: true })
  ).count;
}
export async function trackingGaps(
  start: string,
  end: string,
  groupIds?: string[],
) {
  const config = await prisma.reportAutomation.findUnique({
    where: { id: "parent-reports" },
  });
  if (!config) return [];
  const [groups, lessons] = await Promise.all([
    prisma.group.findMany({
      where: {
        archivedAt: null,
        status: { not: "EXPIRED" },
        ...(groupIds ? { id: { in: groupIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        schedule: true,
        createdAt: true,
        endTime: true,
      },
    }),
    prisma.lesson.findMany({
      where: { dateKey: { gte: start, lt: end } },
      select: { groupId: true, dateKey: true },
    }),
  ]);
  const known = new Set(lessons.map((l) => l.groupId + ":" + l.dateKey));
  const gaps = [];
  for (
    let key = start > config.trackingStartsOn ? start : config.trackingStartsOn;
    key < end && key <= dateKey();
    key = addDays(key, 1)
  ) {
    const weekday = new Date(key + "T12:00:00Z").getUTCDay();
    for (const group of groups)
      if (
        key >= dateKey(group.createdAt) &&
        (group.schedule === "MWF" ? [1, 3, 5] : [2, 4, 6]).includes(weekday) &&
        !known.has(group.id + ":" + key) &&
        new Date(key + "T" + group.endTime + ":00+05:00") <= new Date()
      )
        gaps.push({ groupId: group.id, name: group.name, dateKey: key });
  }
  return gaps;
}
