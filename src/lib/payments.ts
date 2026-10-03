import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { monthWindow } from "./format";
export const paymentKey = (studentId: string, groupId: string | null) =>
  `${studentId}:${groupId || "legacy"}`;
export function paymentBalance(
  amount: number,
  paidAmount: number,
  status: string,
) {
  return status === "VOID" || status === "REFUND"
    ? 0
    : Math.max(0, amount - paidAmount);
}
export function paymentTotals(
  base: number,
  discount: number,
  bonus: number,
  received: number,
) {
  if (
    ![base, discount, bonus, received].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e9,
    ) ||
    discount > 100
  )
    throw new Error("Проверьте суммы и скидку");
  const amount = Math.max(0, Math.round(base * (1 - discount / 100)) + bonus);
  if (received > amount)
    throw new Error("Полученная сумма превышает начисление");
  return {
    amount,
    paidAmount: received,
    status: received >= amount ? ("PAID" as const) : ("PARTIAL" as const),
  };
}
export async function ledger(params: {
  month: string;
  teacherId?: string;
  q?: string;
  page?: number;
  all?: boolean;
}) {
  const { start, end, month } = monthWindow(params.month);
  const teacherId = params.teacherId || undefined;
  const groupWhere: Prisma.GroupWhereInput = {
    archivedAt: null,
    createdAt: { lt: end },
    ...(teacherId ? { teacherId } : {}),
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    periodStart: { gte: start, lt: end },
    ...(teacherId ? { teacherId } : {}),
  };
  const where: Prisma.StudentWhereInput = {
    ...(params.q ? { name: { contains: params.q, mode: "insensitive" } } : {}),
    OR: [
      {
        archivedAt: null,
        createdAt: { lt: end },
        groups: { some: groupWhere },
      },
      { payments: { some: paymentWhere } },
    ],
  };
  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...(params.all ? {} : { take: 30, skip: ((params.page || 1) - 1) * 30 }),
      select: {
        id: true,
        name: true,
        archivedAt: true,
        groups: {
          where: groupWhere,
          select: {
            id: true,
            name: true,
            monthlyFee: true,
            teacherId: true,
            teacher: { select: { name: true } },
          },
        },
        payments: {
          where: paymentWhere,
          include: {
            group: { select: { name: true } },
            teacher: { select: { name: true } },
          },
        },
      },
    }),
    prisma.student.count({ where }),
  ]);
  const rows = students.flatMap((s) => {
    const keys = new Map(
      s.archivedAt
        ? []
        : s.groups.map((g) => [
            g.id,
            {
              groupId: g.id,
              groupName: g.name,
              teacherId: g.teacherId,
              teacherName: g.teacher?.name || "Без преподавателя",
              baseAmount: g.monthlyFee,
            },
          ]),
    );
    for (const p of s.payments)
      if (!keys.has(p.groupId || ""))
        keys.set(p.groupId || "", {
          groupId: p.groupId || "",
          groupName: p.group?.name || "Без группы (архив)",
          teacherId: p.teacherId,
          teacherName: p.teacher?.name || "Без преподавателя",
          baseAmount: p.baseAmount || p.amount,
        });
    return [...keys.values()].map((g) => {
      const p = s.payments.find((p) => (p.groupId || "") === g.groupId);
      const amount = p?.amount ?? g.baseAmount;
      const paidAmount = p?.paidAmount ?? 0;
      const status = p?.status || "PARTIAL";
      return {
        ...g,
        key: paymentKey(s.id, g.groupId),
        studentId: s.id,
        studentName: s.name,
        paymentId: p?.id || null,
        baseAmount: p?.baseAmount ?? g.baseAmount,
        discountPct: p?.discountPct ?? 0,
        bonus: p?.bonus ?? 0,
        amount,
        paidAmount,
        status,
        balance: paymentBalance(amount, paidAmount, status),
        method: p?.method || "CASH",
        note: p?.note || "",
        updatedAt: p?.updatedAt.toISOString() || "",
        paidAt: p?.paidAt || null,
      };
    });
  });
  return { rows, total, month, start, end };
}
export async function savePaymentRecord(
  input: {
    studentId: string;
    groupId: string;
    month: string;
    baseAmount: number;
    discountPct: number;
    bonus: number;
    received: number;
    method: string;
    status: string;
    note: string;
    version: string;
  },
  actor: { id: string; name: string },
) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month))
    throw new Error("Выберите корректный месяц оплаты");
  const { start, end } = monthWindow(input.month);
  const totals = paymentTotals(
    input.baseAmount,
    input.discountPct,
    input.bonus,
    input.received,
  );
  if (
    !["CASH", "CARD", "TRANSFER", "CLICK", "PAYME", "OTHER"].includes(
      input.method,
    )
  )
    throw new Error("Неверный способ оплаты");
  if (!["PAID", "PARTIAL", "VOID", "REFUND"].includes(input.status))
    throw new Error("Неверный статус");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Student" WHERE "id" = ${input.studentId} FOR UPDATE`;
    const old = await tx.payment.findFirst({
      where: {
        studentId: input.studentId,
        groupId: input.groupId || null,
        periodStart: { gte: start, lt: end },
      },
    });
    if (old && old.updatedAt.toISOString() !== input.version)
      throw new Error(
        "Оплата уже изменена другим сотрудником. Обновите страницу.",
      );
    const group = input.groupId
      ? await tx.group.findFirst({
          where: {
            id: input.groupId,
            students: { some: { id: input.studentId } },
          },
        })
      : null;
    if (!old && (!group || group.archivedAt))
      throw new Error("Ученик не состоит в действующей группе");
    const cancelled = input.status === "VOID" || input.status === "REFUND";
    const data = {
      baseAmount: input.baseAmount,
      discountPct: input.discountPct,
      bonus: input.bonus,
      amount: totals.amount,
      paidAmount: cancelled ? 0 : totals.paidAmount,
      status: cancelled ? (input.status as "VOID" | "REFUND") : totals.status,
      method: input.method as
        | "CASH"
        | "CARD"
        | "TRANSFER"
        | "CLICK"
        | "PAYME"
        | "OTHER",
      note: input.note || null,
      ...(!old || old.paidAmount !== totals.paidAmount
        ? { paidAt: new Date() }
        : {}),
    };
    const row = old
      ? await tx.payment.update({ where: { id: old.id }, data })
      : await tx.payment.create({
          data: {
            ...data,
            studentId: input.studentId,
            groupId: input.groupId,
            teacherId: group!.teacherId,
            periodStart: start,
            periodEnd: end,
          },
        });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: "PAYMENT",
        entity: "Student",
        entityId: input.studentId,
        summary: `Оплата ${start.toISOString().slice(0, 7)} · ${group?.name || "архивная группа"}: начислено ${old?.amount ?? 0} → ${row.amount}, получено ${old?.paidAmount ?? 0} → ${row.paidAmount}, ${row.status}`,
      },
    });
    return row;
  });
}
