"use server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { textField } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
const refresh = (id: string) => {
  revalidatePath("/admin/students");
  revalidatePath("/admin/students/" + id);
  revalidatePath("/admin");
};
export async function saveStudent(f: FormData) {
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const name = textField(f, "name");
  const phone = textField(f, "phone", 50);
  const note = textField(f, "note", 5000);
  if (!name) throw new Error("Укажите имя ученика");
  const groupIds = [
    ...new Set(f.getAll("groupIds").map(String).filter(Boolean)),
  ];
  if (
    (await prisma.group.count({
      where: { id: { in: groupIds }, archivedAt: null },
    })) !== groupIds.length
  )
    throw new Error("Группа недоступна");
  const student = await prisma.$transaction(async (tx) => {
    const old = id
      ? await tx.student.findUnique({
          where: { id },
          include: { groups: { select: { id: true, name: true } } },
        })
      : null;
    if (id && !old) throw new Error("Ученик не найден");
    const data = {
      name,
      phone: phone || null,
      note: note || null,
      groups: { set: groupIds.map((id) => ({ id })) },
    };
    const row = id
      ? await tx.student.update({ where: { id }, data })
      : await tx.student.create({
          data: {
            name,
            phone: phone || null,
            note: note || null,
            groups: { connect: groupIds.map((id) => ({ id })) },
          },
        });
    const changedGroups =
      !old ||
      old.groups
        .map((g) => g.id)
        .sort()
        .join() !== [...groupIds].sort().join();
    const groups = changedGroups
      ? await tx.group.findMany({
          where: { id: { in: groupIds } },
          select: { name: true },
        })
      : [];
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: id ? "UPDATE" : "CREATE",
        entity: "Student",
        entityId: row.id,
        summary: changedGroups
          ? `${name}: группы ${old?.groups.map((g) => g.name).join(", ") || "—"} → ${groups.map((g) => g.name).join(", ") || "—"}`
          : `Обновлена карточка ${name}`,
      },
    });
    return row;
  });
  refresh(student.id);
  if (!id) redirect("/admin/students/" + student.id);
}
export async function archiveStudent(f: FormData) {
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const restore = f.get("restore") === "1";
  await prisma.$transaction(async (tx) => {
    const s = await tx.student.update({
      where: { id },
      data: { archivedAt: restore ? null : new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: restore ? "RESTORE" : "ARCHIVE",
        entity: "Student",
        entityId: id,
        summary: `${restore ? "Восстановлен" : "Архивирован"} ученик ${s.name}`,
      },
    });
  });
  refresh(id);
}
export async function saveParent(f: FormData) {
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const studentId = textField(f, "studentId");
  const name = textField(f, "name");
  const phone = textField(f, "phone", 50);
  if (!name || !phone) throw new Error("Укажите имя и телефон родителя");
  const reportLanguage = ["RU", "UZ", "BOTH"].includes(
    textField(f, "reportLanguage"),
  )
    ? textField(f, "reportLanguage")
    : "BOTH";
  const weeklyReports = f.get("weeklyReports") === "1";
  await prisma.$transaction(async (tx) => {
    if (id) {
      const p = await tx.parent.findFirst({ where: { id, studentId } });
      if (!p) throw new Error("Родитель не найден");
      if (p.phone !== phone)
        await tx.telegramPendingLink.updateMany({
          where: { parentId: id, status: "PENDING" },
          data: { status: "REJECTED" },
        });
      await tx.parent.update({
        where: { id },
        data: {
          name,
          phone,
          reportLanguage,
          weeklyReports,
          ...(p.phone !== phone ? { telegramId: null } : {}),
        },
      });
    } else {
      await tx.parent.create({
        data: { studentId, name, phone, reportLanguage, weeklyReports },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: "PARENT",
        entity: "Student",
        entityId: studentId,
        summary: `${id ? "Обновлён" : "Добавлен"} контакт родителя ${name}`,
      },
    });
  });
  refresh(studentId);
}
export async function unlinkParent(f: FormData) {
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const studentId = textField(f, "studentId");
  await prisma.$transaction(async (tx) => {
    const p = await tx.parent.findFirst({ where: { id, studentId } });
    if (!p) throw new Error("Контакт не найден");
    await tx.parent.update({ where: { id }, data: { telegramId: null } });
    await tx.telegramPendingLink.updateMany({
      where: { parentId: id, status: "PENDING" },
      data: { status: "REJECTED" },
    });
    await tx.parentInvite.updateMany({
      where: { parentId: id, status: "ACTIVE" },
      data: { status: "REVOKED" },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: "UNLINK",
        entity: "Student",
        entityId: studentId,
        summary: `Отключён Telegram родителя ${p.name}`,
      },
    });
  });
  refresh(studentId);
}
export async function createInvite(f: FormData) {
  const user = await requireRole("ADMIN", "DIRECTOR");
  const studentId = textField(f, "studentId");
  const invite = await prisma.parentInvite.create({
    data: {
      studentId,
      code: "eit" + randomBytes(16).toString("hex"),
      createdById: user.id,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  redirect(`/admin/students/${studentId}?invite=${invite.code}`);
}
