import { prisma } from "./prisma";
import { AttendanceStatus, HomeworkStatus, Prisma } from "@prisma/client";
import { dateKey } from "./format";
import { ensureLesson, validDateKey } from "./lessons";
import { lessonMessage, reportLanguage } from "./report-messages";
type Fields = {
  studentId: string;
  groupId: string;
  attendance: AttendanceStatus;
  homework: HomeworkStatus;
  comment: string | null;
  dateKey: string;
  topic?: string | null;
  covered?: string | null;
  assignment?: string | null;
  expectedVersion?: number;
  reason?: string;
};
const snapshot = (r: {
  attendance: string;
  homework: string;
  comment: string | null;
  topic: string | null;
  covered: string | null;
  assignment: string | null;
}) => ({
  attendance: r.attendance,
  homework: r.homework,
  comment: r.comment,
  topic: r.topic,
  covered: r.covered,
  assignment: r.assignment,
});
export async function saveLessonReport(
  data: Fields,
  actor: { id: string; name: string; role: string },
) {
  if (
    !Object.values(AttendanceStatus).includes(data.attendance) ||
    !Object.values(HomeworkStatus).includes(data.homework)
  )
    throw new Error("Некорректная отметка");
  if (!validDateKey(data.dateKey) || data.dateKey > dateKey())
    throw new Error("Проверьте дату занятия");
  if (!["TEACHER", "ADMIN", "DIRECTOR"].includes(actor.role))
    throw new Error("Нет доступа к отчётам");
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Group" WHERE id=${data.groupId} FOR UPDATE`;
      const group = await tx.group.findFirst({
        where: {
          id: data.groupId,
          archivedAt: null,
          ...(actor.role === "TEACHER" ? { teacherId: actor.id } : {}),
        },
      });
      if (!group) throw new Error("Нет доступа к ученику в этой группе");
      const student = await tx.student.findFirst({
        where: { id: data.studentId, archivedAt: null },
        include: { parents: true },
      });
      if (!student) throw new Error("Ученик недоступен");
      const old = await tx.report.findUnique({
        where: {
          studentId_groupId_dateKey: {
            studentId: data.studentId,
            groupId: data.groupId,
            dateKey: data.dateKey,
          },
        },
      });
      if (old && data.expectedVersion === undefined) return old;
      if (old && data.expectedVersion !== old.version)
        throw new Error("Отчёт уже изменён. Обновите страницу.");
      if (!old && data.expectedVersion && data.expectedVersion !== 0)
        throw new Error("Отчёт не найден");
      let lesson = await tx.lesson.findUnique({
        where: {
          groupId_dateKey: { groupId: group.id, dateKey: data.dateKey },
        },
      });
      if (!old) {
        lesson = await ensureLesson(tx, group.id, data.dateKey);
        if (lesson.cancelledAt) throw new Error("Занятие отменено");
        const member = await tx.lessonStudent.findUnique({
          where: {
            lessonId_studentId: { lessonId: lesson.id, studentId: student.id },
          },
        });
        if (!member) throw new Error("Ученика нет в списке на дату занятия");
      }
      const values = {
        attendance: data.attendance,
        homework: data.homework,
        comment: data.comment?.trim().slice(0, 1200) || null,
        topic: (data.topic ?? lesson?.topic)?.trim().slice(0, 180) || null,
        covered:
          (data.covered ?? lesson?.covered)?.trim().slice(0, 500) || null,
        assignment:
          (data.assignment ?? lesson?.assignment)?.trim().slice(0, 600) || null,
      };
      if (old && JSON.stringify(snapshot(old)) === JSON.stringify(values))
        return old;
      if (old && !data.reason?.trim())
        throw new Error("Укажите причину исправления");
      if (!old && !values.topic && data.expectedVersion !== undefined)
        throw new Error("Сначала сохраните тему занятия");
      const report = old
        ? await tx.report.update({
            where: { id: old.id },
            data: { ...values, version: { increment: 1 } },
          })
        : await tx.report.create({
            data: {
              ...values,
              studentId: student.id,
              groupId: group.id,
              teacherId:
                actor.role === "TEACHER"
                  ? actor.id
                  : group.teacherId || actor.id,
              dateKey: data.dateKey,
            },
          });
      await tx.reportRevision.create({
        data: {
          reportId: report.id,
          version: report.version,
          actorId: actor.id,
          actorName: actor.name,
          reason: old ? data.reason!.trim().slice(0, 300) : "Первичный отчёт",
          before: old ? snapshot(old) : Prisma.DbNull,
          after: snapshot(report),
        },
      });
      if (old)
        await tx.telegramDelivery.updateMany({
          where: {
            sourceType: "REPORT",
            sourceId: report.id,
            status: { not: "SENT" },
            cancelledAt: null,
          },
          data: {
            cancelledAt: new Date(),
            error: "Заменено исправленной версией отчёта",
          },
        });
      const teacher = await tx.user.findUniqueOrThrow({
        where: { id: report.teacherId },
        select: { name: true },
      });
      // Outbox and report are committed together: a process crash cannot lose the notification.
      await tx.telegramDelivery.createMany({
        data: student.parents
          .filter((p) => p.telegramId !== null)
          .map((p) => ({
            studentId: student.id,
            parentId: p.id,
            chatId: p.telegramId!,
            messageText: lessonMessage(
              {
                ...report,
                studentName: student.name,
                groupName: group.name,
                teacherName: teacher.name,
                reason: data.reason
                  ? actor.name + ": " + data.reason
                  : undefined,
              },
              reportLanguage(p.reportLanguage),
            ),
            actorType: "USER",
            actorId: actor.id,
            sourceType: "REPORT",
            sourceId: report.id,
            sourceVersion: report.version,
            idempotencyKey: `REPORT:${report.id}:v${report.version}`,
            autoRetry: true,
          })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorName: actor.name,
          action: old ? "REPORT_CORRECTION" : "ATTENDANCE",
          entity: "Student",
          entityId: student.id,
          summary: `${data.dateKey} · ${group.name}: ${old ? "исправлен" : "сохранён"} отчёт v${report.version}${old ? " · " + data.reason : ""}`,
        },
      });
      return report;
    },
    { timeout: 15000 },
  );
}
// Compatibility for callers that only record attendance; new forms use explicit versions.
export async function recordAttendance(data: Fields & { teacherId: string }) {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { id: data.teacherId },
  });
  return saveLessonReport(data, teacher);
}
