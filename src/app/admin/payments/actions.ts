"use server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ledger, savePaymentRecord } from "@/lib/payments";
import { textField, dateKey, money } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendTelegramToStudentParents } from "@/lib/telegramDelivery";
export async function getTeachers() {
  await requireRole("ADMIN", "DIRECTOR");
  return prisma.user.findMany({
    where: { role: "TEACHER", disabledAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
export async function saveStudentPayment(f: FormData) {
  const actor = await requireRole("ADMIN", "DIRECTOR");
  await savePaymentRecord(
    {
      studentId: textField(f, "studentId"),
      groupId: textField(f, "groupId"),
      month: textField(f, "month"),
      baseAmount: Number(f.get("baseAmount")),
      discountPct: Number(f.get("discountPct")),
      bonus: Number(f.get("bonus")),
      received: Number(f.get("received")),
      method: textField(f, "method"),
      status: textField(f, "status"),
      note: textField(f, "note", 2000),
      version: textField(f, "version"),
    },
    actor,
  );
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  revalidatePath("/admin/students/" + textField(f, "studentId"));
}
export async function sendPaymentReminders(f: FormData) {
  const user = await requireRole("ADMIN", "DIRECTOR");
  if (f.get("confirm") !== "yes")
    throw new Error("Подтвердите отправку родителям");
  const data = await ledger({
    month: textField(f, "month"),
    teacherId: textField(f, "teacherId"),
    all: true,
  });
  const due = data.rows.filter((r) => r.balance > 0);
  // Each button press is audited; a repeated press on the same day is deduplicated.
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorName: user.name,
      action: "REMINDERS",
      entity: "Payment",
      entityId: data.month,
      summary: `Запрошены напоминания: ${due.length} начислений`,
    },
  });
  after(async () => {
    for (const r of due)
      await sendTelegramToStudentParents(
        r.studentId,
        `EIT · Напоминание об оплате\nУченик: ${r.studentName}\nГруппа: ${r.groupName}\nПериод: ${data.month}\nОстаток: ${money(r.balance)}\nПо вопросам: +998 77 114 11 33`,
        { type: "USER", id: user.id },
        {
          sourceType: "PAYMENT_REMINDER",
          sourceId: r.key + ":" + data.month,
          idempotencyKey: `payment:${r.key}:${data.month}:${dateKey()}`,
        },
      );
  });
  revalidatePath("/admin/telegram-status");
}
