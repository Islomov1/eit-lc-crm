import { prisma } from "./prisma";
export async function convertLeadRecord(
  id: string,
  groupId: string,
  actor: { id: string; name: string },
  existingStudentId?: string,
) {
  return prisma.$transaction(async (tx) => {
    // Concurrent clicks and retries must create exactly one student.
    await tx.$queryRaw`SELECT "id" FROM "Lead" WHERE "id" = ${id} FOR UPDATE`;
    const lead = await tx.lead.findUniqueOrThrow({ where: { id } });
    if (lead.studentId) return lead.studentId;
    if (lead.archivedAt) throw new Error("Сначала восстановите лид из архива");
    const group = await tx.group.findFirst({
      where: { id: groupId, archivedAt: null },
    });
    if (!group) throw new Error("Выберите действующую группу");
    if (
      existingStudentId &&
      !(await tx.student.findFirst({
        where: { id: existingStudentId, archivedAt: null },
      }))
    )
      throw new Error("Ученик не найден");
    const student = existingStudentId
      ? await tx.student.update({
          where: { id: existingStudentId },
          data: { groups: { connect: { id: groupId } } },
        })
      : await tx.student.create({
          data: {
            name: lead.name,
            phone: lead.phone,
            note: lead.note,
            groups: { connect: { id: groupId } },
          },
        });
    await tx.lead.update({
      where: { id },
      data: {
        status: "CONVERTED",
        studentId: student.id,
        followUpAt: null,
        activities: {
          create: {
            actorName: actor.name,
            text: `Зачислен в ${group.name}. ${existingStudentId ? "Связан с существующим учеником." : "Создана карточка ученика."}`,
          },
        },
      },
    });
    await tx.auditLog.createMany({
      data: [
        {
          actorId: actor.id,
          actorName: actor.name,
          action: "CONVERT",
          entity: "Lead",
          entityId: id,
          summary: `${lead.name} → ученик, группа ${group.name}`,
        },
        {
          actorId: actor.id,
          actorName: actor.name,
          action: "ENROLL",
          entity: "Student",
          entityId: student.id,
          summary: `Зачисление из лида в группу ${group.name}`,
        },
      ],
    });
    return student.id;
  });
}
