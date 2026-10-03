import { prisma } from "./prisma";
import { AttendanceStatus, HomeworkStatus } from "@prisma/client";
export async function recordAttendance(data: {
  studentId: string;
  groupId: string;
  teacherId: string;
  attendance: AttendanceStatus;
  homework: HomeworkStatus;
  comment: string | null;
  dateKey: string;
}) {
  if (
    !Object.values(AttendanceStatus).includes(data.attendance) ||
    !Object.values(HomeworkStatus).includes(data.homework)
  )
    throw new Error("Некорректная отметка");
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.findFirst({
      where: {
        id: data.groupId,
        teacherId: data.teacherId,
        archivedAt: null,
        students: { some: { id: data.studentId, archivedAt: null } },
      },
    });
    if (!group) throw new Error("Нет доступа к ученику в этой группе");
    const existing = await tx.report.findUnique({
      where: {
        studentId_groupId_dateKey: {
          studentId: data.studentId,
          groupId: data.groupId,
          dateKey: data.dateKey,
        },
      },
    });
    if (existing) return existing;
    const report = await tx.report.upsert({
      where: {
        studentId_groupId_dateKey: {
          studentId: data.studentId,
          groupId: data.groupId,
          dateKey: data.dateKey,
        },
      },
      create: data,
      update: {},
    });
    await tx.auditLog.create({
      data: {
        actorId: data.teacherId,
        actorName: "Преподаватель",
        action: "ATTENDANCE",
        entity: "Student",
        entityId: data.studentId,
        summary: `${data.dateKey} · ${group.name}: ${data.attendance}, ДЗ ${data.homework}`,
      },
    });
    return report;
  });
}
