import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { dateKey } from "./format";
export const addDays = (key: string, n: number) =>
  new Date(Date.parse(key + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function validDateKey(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function previousWeek(now = new Date()) {
  const today = dateKey(now);
  const weekday = new Date(today + "T12:00:00Z").getUTCDay();
  const monday = addDays(today, -(weekday === 0 ? 6 : weekday - 1));
  return { start: addDays(monday, -7), end: addDays(monday, -1), next: monday };
}
// Caller locks the group row. Rosters are snapshots, never inferred for past dates.
export async function ensureLesson(
  tx: Prisma.TransactionClient,
  groupId: string,
  key: string,
) {
  const old = await tx.lesson.findUnique({
    where: { groupId_dateKey: { groupId, dateKey: key } },
  });
  if (old) {
    if (key === dateKey() && !old.cancelledAt) {
      const current = await tx.student.findMany({
        where: { archivedAt: null, groups: { some: { id: groupId } } },
        select: { id: true },
      });
      await tx.lessonStudent.createMany({
        data: current.map((s) => ({ lessonId: old.id, studentId: s.id })),
        skipDuplicates: true,
      });
    }
    return old;
  }
  if (key !== dateKey())
    throw new Error(
      "За прошлую дату нет списка занятия. Обратитесь к администратору.",
    );
  const group = await tx.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      students: { where: { archivedAt: null }, select: { id: true } },
    },
  });
  if (group.archivedAt || group.status === "EXPIRED")
    throw new Error("Группа недоступна");
  return tx.lesson.create({
    data: {
      groupId,
      dateKey: key,
      endTime: group.endTime,
      students: { create: group.students.map((s) => ({ studentId: s.id })) },
    },
  });
}
export async function snapshotTodaysLessons() {
  const key = dateKey();
  const day = new Date(key + "T12:00:00Z").getUTCDay();
  if (day === 0) return 0;
  const groups = await prisma.group.findMany({
    where: {
      archivedAt: null,
      status: { not: "EXPIRED" },
      schedule: [1, 3, 5].includes(day) ? "MWF" : "TTS",
    },
    select: { id: true },
  });
  for (const group of groups)
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Group" WHERE id=${group.id} FOR UPDATE`;
      await ensureLesson(tx, group.id, key);
    });
  return groups.length;
}
export async function saveLessonDetails(
  data: {
    groupId: string;
    dateKey: string;
    topic: string;
    covered: string;
    assignment: string;
    cancel?: boolean;
    reason?: string;
  },
  actor: { id: string; name: string; role: string },
) {
  if (!validDateKey(data.dateKey) || data.dateKey > dateKey())
    throw new Error("Проверьте дату занятия");
  if (!data.cancel && !data.topic.trim())
    throw new Error("Укажите тему занятия");
  if (data.cancel && !data.reason?.trim())
    throw new Error("Укажите причину отмены");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Group" WHERE id=${data.groupId} FOR UPDATE`;
    const group = await tx.group.findFirst({
      where: {
        id: data.groupId,
        archivedAt: null,
        ...(actor.role === "TEACHER" ? { teacherId: actor.id } : {}),
      },
    });
    if (!group || !["TEACHER", "ADMIN", "DIRECTOR"].includes(actor.role))
      throw new Error("Нет доступа к группе");
    const lesson = await ensureLesson(tx, group.id, data.dateKey);
    if (
      data.cancel &&
      (await tx.report.count({
        where: { groupId: group.id, dateKey: data.dateKey },
      }))
    )
      throw new Error(
        "На занятии уже есть отметки. Исправьте отчёты, отмена недоступна.",
      );
    await tx.lesson.update({
      where: { id: lesson.id },
      data: {
        topic: data.topic.trim().slice(0, 180),
        covered: data.covered.trim().slice(0, 500),
        assignment: data.assignment.trim().slice(0, 600),
        cancelledAt: data.cancel ? new Date() : null,
        cancelReason: data.cancel ? data.reason?.slice(0, 300) : null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: "LESSON",
        entity: "Group",
        entityId: group.id,
        summary: `${data.dateKey}: ${data.cancel ? "Занятие отменено: " + data.reason : "Сохранены сведения о занятии: " + data.topic}`,
      },
    });
  });
}
