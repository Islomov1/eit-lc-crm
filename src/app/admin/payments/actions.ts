"use server";

import { revalidatePath } from "next/cache";
import { PaymentMethod, PaymentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/* ── helpers ─────────────────────────────────────────────── */

function monthWindowFromYYYYMM(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) throw new Error("Invalid month format. Use YYYY-MM");
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0, 0);
  return { start, end };
}

function parsePaymentMethod(value: unknown): PaymentMethod {
  const v = String(value || "").toUpperCase();
  if (v in PaymentMethod) return PaymentMethod[v as keyof typeof PaymentMethod];
  return PaymentMethod.CASH;
}

function parsePaymentStatus(value: unknown): PaymentStatus {
  const v = String(value || "").toUpperCase();
  if (v in PaymentStatus) return PaymentStatus[v as keyof typeof PaymentStatus];
  return PaymentStatus.PAID;
}

function toInt(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

/** Calculate final amount from base, discount %, and bonus */
 function calcFinalAmount(base: number, discountPct: number, bonus: number): number {
  const discounted = Math.round(base * (1 - clamp(discountPct, 0, 100) / 100));
  return Math.max(0, discounted + bonus);
}

/* ── queries ─────────────────────────────────────────────── */

export async function getTeachers() {
  return prisma.user.findMany({
    where: { role: Role.TEACHER },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true },
  });
}

export async function getTeacherSheet(params: {
  teacherId: string;
  month: string;
  q?: string;
}) {
  const { start, end } = monthWindowFromYYYYMM(params.month);

  const teacher = await prisma.user.findUnique({
    where: { id: params.teacherId },
    select: { id: true, name: true },
  });

  if (!teacher) throw new Error("Teacher not found");

  const q = (params.q || "").trim();

  const students = await prisma.student.findMany({
    where: {
      group: { teacherId: params.teacherId },
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      group: { select: { id: true, name: true, teacherId: true } },
    },
  });

  const payments = await prisma.payment.findMany({
    where: {
      teacherId: params.teacherId,
      periodStart: start,
    },
    select: {
      id: true,
      studentId: true,
      amount: true,
      baseAmount: true,
      discountPct: true,
      bonus: true,
      status: true,
      method: true,
      paidAt: true,
      note: true,
    },
  });

  const payMap = new Map(payments.map((p) => [p.studentId, p]));

  const rows = students.map((s) => {
    const p = payMap.get(s.id);
    const isPaid =
      !!p && (p.status === PaymentStatus.PAID || p.status === PaymentStatus.PARTIAL);

    return {
      studentId: s.id,
      studentName: s.name,
      groupName: s.group?.name ?? "—",
      paid: isPaid,
      paymentId: p?.id ?? null,
      baseAmount: p?.baseAmount ?? 0,
      discountPct: p?.discountPct ?? 0,
      bonus: p?.bonus ?? 0,
      amount: p?.amount ?? 0,
      status: p?.status ?? PaymentStatus.PAID,
      method: p?.method ?? PaymentMethod.CASH,
      paidAt: p?.paidAt ?? null,
      note: p?.note ?? "",
    };
  });

  return { teacher, monthStart: start, monthEnd: end, rows };
}

/* ── mutations ───────────────────────────────────────────── */

export async function saveStudentPayment(formData: FormData) {
  const teacherId = String(formData.get("teacherId") || "");
  const studentId = String(formData.get("studentId") || "");
  const month = String(formData.get("month") || "");
  const method = parsePaymentMethod(formData.get("method"));
  const status = parsePaymentStatus(formData.get("status"));
  const note = String(formData.get("note") || "");

  const baseAmount = toInt(formData.get("baseAmount"));
  const discountPct = clamp(toInt(formData.get("discountPct")), 0, 100);
  const bonus = toInt(formData.get("bonus"));
  const amount = calcFinalAmount(baseAmount, discountPct, bonus);

  if (!teacherId) throw new Error("teacherId is required");
  if (!studentId) throw new Error("studentId is required");
  if (!month) throw new Error("month is required");

  const { start, end } = monthWindowFromYYYYMM(month);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { group: true },
  });

  if (!student) throw new Error("Student not found");

  const groupId = student.group?.id ?? null;
  const snapshotTeacherId = student.group?.teacherId ?? null;

  if (snapshotTeacherId !== teacherId) {
    throw new Error("This student is not assigned to this teacher");
  }

  await prisma.payment.upsert({
    where: {
      studentId_periodStart: { studentId, periodStart: start },
    },
    create: {
      studentId,
      teacherId,
      groupId,
      periodStart: start,
      periodEnd: end,
      baseAmount,
      discountPct,
      bonus,
      amount,
      method,
      status,
      note: note || null,
      paidAt: new Date(),
      classesIncluded: 12,
    },
    update: {
      baseAmount,
      discountPct,
      bonus,
      amount,
      method,
      status,
      note: note || null,
      paidAt: new Date(),
      groupId,
      teacherId,
    },
  });

  revalidatePath("/admin/payments");
}

export async function deletePayment(formData: FormData) {
  

  const id = formData.get("id")?.toString();
  if (!id) return;

  await prisma.payment.delete({ where: { id } });

  revalidatePath("/admin/payments");
}

// ── ДОБАВЬ В КОНЕЦ actions.ts ──────────────────────────────

export async function sendPaymentReminders(formData: FormData) {
  const month = String(formData.get("month") || "");
  if (!month) throw new Error("month is required");

  const { start } = monthWindowFromYYYYMM(month);

  // Все активные студенты в группах
  const allStudents = await prisma.student.findMany({
    where: { groupId: { not: null } },
    select: {
      id: true,
      name: true,
      group: { select: { name: true } },
      parents: { select: { id: true, telegramId: true, name: true } },
    },
  });

  // Кто уже заплатил за этот месяц
  const paidStudentIds = await prisma.payment.findMany({
    where: { periodStart: start, status: { in: ["PAID", "PARTIAL"] } },
    select: { studentId: true },
  });
  const paidSet = new Set(paidStudentIds.map((p) => p.studentId));

  // Только неоплатившие у кого есть привязанный Telegram
  const unpaid = allStudents.filter(
    (s) => !paidSet.has(s.id) && s.parents.some((p) => p.telegramId !== null)
  );

  if (unpaid.length === 0) return ;

  const monthLabel = new Date(start).toLocaleString("ru-RU", { month: "long", year: "numeric" });
  const monthLabelUz = new Date(start).toLocaleString("uz-UZ", { month: "long", year: "numeric" });

  const { sendTelegramToStudentParents } = await import("@/lib/telegramDelivery");

  let sent = 0;
  let skipped = 0;

  for (const student of unpaid) {
    const linkedParents = student.parents.filter((p) => p.telegramId !== null);
    if (linkedParents.length === 0) { skipped++; continue; }

    const message = `
💳 НАПОМИНАНИЕ ОБ ОПЛАТЕ
EIT LC

Уважаемый родитель!

Оплата за обучение за ${monthLabel} для вашего ребёнка:
👤 ${student.name}
📚 Группа: ${student.group?.name ?? "—"}

ещё не поступила. Просим оплатить в ближайшее время.

По вопросам: +998 77 114 11 33

—————————————

💳 TO'LOV ESLATMASI
EIT LC

Hurmatli ota-ona!

${monthLabelUz} oyi uchun o'qish to'lovi:
👤 ${student.name}
📚 Guruh: ${student.group?.name ?? "—"}

hali amalga oshirilmagan. Iltimos, yaqin orada to'lovni amalga oshiring.

Savollar uchun: +998 77 114 11 33
    `.trim();

    try {
      await sendTelegramToStudentParents(
        student.id,
        message,
        { type: "SYSTEM" },
        {
          sourceType: "PAYMENT_REMINDER",
          sourceId: `${student.id}:${month}`,
          idempotencyKey: `reminder:${student.id}:${month}:${Date.now()}`,
        }
      );
      sent++;
    } catch {
      skipped++;
    }
  }

console.log(`Reminders: ${sent} sent, ${skipped} skipped`);
revalidatePath("/admin/payments");
}