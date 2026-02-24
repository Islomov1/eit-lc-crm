"use server";

import { revalidatePath } from "next/cache";
import { PaymentMethod, PaymentStatus, Role } from "@prisma/client";

// CHANGE THIS LINE if needed:
import { prisma } from "@/lib/prisma";

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
  return Math.trunc(n);
}

export async function getTeachers() {
  return prisma.user.findMany({
    where: { role: Role.TEACHER },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true },
  });
}

export async function getTeacherSheet(params: { teacherId: string; month: string; q?: string }) {
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
      status: true,
      method: true,
      paidAt: true,
    },
  });

  const payMap = new Map(payments.map((p) => [p.studentId, p]));

  const rows = students.map((s) => {
    const p = payMap.get(s.id);
    const isPaid = !!p && (p.status === PaymentStatus.PAID || p.status === PaymentStatus.PARTIAL);

    return {
  studentId: s.id,
  studentName: s.name,
  groupName: s.group?.name ?? "-",
  paid: isPaid,
  paymentId: p?.id ?? null,   // ✅ add this
  amount: p?.amount ?? 0,
  status: p?.status ?? PaymentStatus.PAID,
  method: p?.method ?? PaymentMethod.CASH,
  paidAt: p?.paidAt ?? null,
};
  });

  return {
    teacher,
    monthStart: start,
    monthEnd: end,
    rows,
  };
}

/**
 * This creates OR updates the payment for (studentId + periodStart).
 * paidAt is set automatically to NOW whenever you save.
 */
export async function saveStudentPayment(formData: FormData) {
  const teacherId = String(formData.get("teacherId") || "");
  const studentId = String(formData.get("studentId") || "");
  const month = String(formData.get("month") || "");
  const amount = toInt(formData.get("amount"));
  const method = parsePaymentMethod(formData.get("method"));
  const status = parsePaymentStatus(formData.get("status"));

  if (!teacherId) throw new Error("teacherId is required");
  if (!studentId) throw new Error("studentId is required");
  if (!month) throw new Error("month is required");
  if (amount < 0) throw new Error("amount cannot be negative");

  const { start, end } = monthWindowFromYYYYMM(month);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { group: true },
  });

  if (!student) throw new Error("Student not found");

  const groupId = student.group?.id ?? null;
  const snapshotTeacherId = student.group?.teacherId ?? null;

  // If student is not in this teacher group, block (avoids wrong payments)
  if (snapshotTeacherId !== teacherId) {
    throw new Error("This student is not assigned to this teacher");
  }

  // Requires @@unique([studentId, periodStart]) so Prisma generates this compound key.
  await prisma.payment.upsert({
    where: {
      studentId_periodStart: {
        studentId,
        periodStart: start,
      },
    },
    create: {
      studentId,
      teacherId,
      groupId,
      periodStart: start,
      periodEnd: end,
      amount,
      method,
      status,
      paidAt: new Date(), // auto
      classesIncluded: 12,
    },
    update: {
      amount,
      method,
      status,
      paidAt: new Date(), // auto update date
      groupId,
      teacherId,
    },
  });

  revalidatePath("/admin/payments");
}
export async function deletePayment(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  await prisma.payment.delete({ where: { id } });

  revalidatePath("/admin/payments");
}