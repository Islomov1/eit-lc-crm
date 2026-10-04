"use server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { textField, parseLocalDate } from "@/lib/format";
import { LeadStatus, LearningFormat } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { sendLeadEvent, statusToEvent } from "@/lib/meta-events";
import { convertLeadRecord } from "@/lib/lead-workflow";
const refresh = (id: string) => {
  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads/" + id);
  revalidatePath("/admin");
};
export async function saveLead(f: FormData) {
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const name = textField(f, "name");
  const status = textField(f, "status") || "NEW";
  const ownerId = textField(f, "ownerId");
  const learningFormat = textField(f, "learningFormat") || "UNKNOWN";
  if (!Object.values(LearningFormat).includes(learningFormat as LearningFormat)) throw new Error("Некорректный формат обучения");
  const lossReason = textField(f, "lossReason", 1000);
  if (!name) throw new Error("Укажите имя");
  if (!Object.values(LeadStatus).includes(status as LeadStatus))
    throw new Error("Некорректный статус");
  if (status === "LOST" && !lossReason)
    throw new Error("Укажите причину отказа");
  if (
    ownerId &&
    !(await prisma.user.findFirst({
      where: {
        id: ownerId,
        role: { in: ["ADMIN", "DIRECTOR"] },
        disabledAt: null,
      },
    }))
  )
    throw new Error("Ответственный недоступен");
  const result = await prisma.$transaction(async (tx) => {
    const old = id ? await tx.lead.findUniqueOrThrow({ where: { id } }) : null;
    if (status === "CONVERTED" && !old?.studentId)
      throw new Error("Используйте кнопку «Зачислить»");
    if (old?.studentId && status !== "CONVERTED")
      throw new Error("Зачисленный лид связан с карточкой ученика");
    const data = {
      name,
      phone: textField(f, "phone", 50) || null,
      source: textField(f, "source", 100) || "manual",
      program: textField(f, "program", 100) || null,
      learningFormat: f.has("learningFormat") ? learningFormat as LearningFormat : old?.learningFormat || "UNKNOWN",
      note: textField(f, "note", 5000) || null,
      status: status as LeadStatus,
      ownerId: ownerId || null,
      followUpAt: parseLocalDate(textField(f, "followUpAt")),
      trialAt: parseLocalDate(textField(f, "trialAt")),
      lossReason: status === "LOST" ? lossReason : null,
    };
    const lead = id
      ? await tx.lead.update({ where: { id }, data })
      : await tx.lead.create({ data });
    const summary = !old
      ? "Лид добавлен вручную"
      : old.status !== lead.status
        ? `Статус: ${old.status} → ${lead.status}`
        : "Обновлены контакты, ответственный или план работы";
    await tx.leadActivity.create({
      data: { leadId: lead.id, actorName: actor.name, text: summary },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: old ? "UPDATE" : "CREATE",
        entity: "Lead",
        entityId: lead.id,
        summary: `${lead.name}: ${summary}`,
      },
    });
    return { lead, changed: !old || old.status !== lead.status };
  });
  if (result.changed) {
    const event = statusToEvent(result.lead.status);
    if (event)
      after(() =>
        sendLeadEvent({
          event,
          leadId: result.lead.id,
          phone: result.lead.phone,
          source: result.lead.source,
          program: result.lead.program,
        }),
      );
  }
  refresh(result.lead.id);
  if (!id) redirect("/admin/leads/" + result.lead.id);
}
export async function addActivity(f: FormData) {
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const text = textField(f, "text", 3000);
  if (!text) throw new Error("Добавьте результат разговора");
  await prisma.leadActivity.create({
    data: { leadId: id, actorName: actor.name, text },
  });
  refresh(id);
}
export async function archiveLead(f: FormData) {
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const restore = f.get("restore") === "1";
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id },
      data: {
        archivedAt: restore ? null : new Date(),
        activities: {
          create: {
            actorName: actor.name,
            text: restore ? "Восстановлен из архива" : "Перенесён в архив",
          },
        },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: restore ? "RESTORE" : "ARCHIVE",
        entity: "Lead",
        entityId: id,
        summary: restore ? "Лид восстановлен" : "Лид архивирован",
      },
    });
  });
  refresh(id);
}
export async function convertLead(f: FormData) {
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const studentId = await convertLeadRecord(
    id,
    textField(f, "groupId"),
    actor,
    textField(f, "studentId") || undefined,
  );
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
  after(() =>
    sendLeadEvent({
      event: "Enrolled",
      leadId: id,
      phone: lead.phone,
      source: lead.source,
      program: lead.program,
    }),
  );
  refresh(id);
  revalidatePath("/admin/students");
  redirect("/admin/students/" + studentId);
}
export async function saveLeadForm(f: FormData) {
  const actor = await requireRole("DIRECTOR");
  const id = textField(f, "id", 50);
  const name = textField(f, "name", 100);
  const program = textField(f, "program", 100);
  const learningFormat = textField(f, "learningFormat") || "UNKNOWN";
  if (!Object.values(LearningFormat).includes(learningFormat as LearningFormat)) throw new Error("Некорректный формат обучения");
  if (!/^\d{5,50}$/.test(id) || !name || !program)
    throw new Error("Укажите ID формы, название и курс");
  await prisma.$transaction(async (tx) => {
    await tx.leadForm.upsert({
      where: { id },
      create: { id, name, program, learningFormat: learningFormat as LearningFormat },
      update: { name, program, ...(f.has("learningFormat") ? {learningFormat: learningFormat as LearningFormat} : {}) },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: "FORM_MAPPING",
        entity: "LeadForm",
        entityId: id,
        summary: `${name} → ${program}`,
      },
    });
  });
  revalidatePath("/admin/telegram-status");
}
