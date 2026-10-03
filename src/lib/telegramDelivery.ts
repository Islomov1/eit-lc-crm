import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram";
import type { TelegramParseMode } from "@/lib/telegram";
type Actor = { type: "USER" | "PARENT" | "SYSTEM"; id?: string };
type Options = {
  parseMode?: TelegramParseMode;
  sourceType?: string;
  sourceId?: string;
  idempotencyKey?: string;
  force?: boolean;
};
export async function deliverOne(id: string) {
  const d = await prisma.telegramDelivery.findUnique({
    where: { id },
    include: {
      parent: { select: { telegramId: true } },
      student: { select: { archivedAt: true } },
    },
  });
  if (!d) return { status: "SKIPPED" as const };
  if (d.status === "SENT") return { status: "SENT" as const };
  if (d.parent.telegramId !== d.chatId || d.student.archivedAt) {
    await prisma.telegramDelivery.update({
      where: { id },
      data: {
        status: "FAILED",
        attemptCount: 10,
        nextRetryAt: null,
        error: "Получатель отключён или ученик в архиве",
      },
    });
    return { status: "FAILED" as const };
  }
  const now = new Date();
  const claim = await prisma.telegramDelivery.updateMany({
    where: {
      id,
      status: { in: ["PENDING", "FAILED"] },
      attemptCount: { lt: 10 },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    data: {
      attemptCount: { increment: 1 },
      lastAttemptAt: now,
      nextRetryAt: new Date(+now + 60000),
    },
  });
  if (!claim.count) return { status: "SKIPPED" as const };
  const mode =
    d.parseMode === "HTML" || d.parseMode === "MarkdownV2"
      ? d.parseMode
      : undefined;
  const result = await sendTelegramMessage(d.chatId, d.messageText, {
    parseMode: mode,
  }).catch(() => ({
    ok: false as const,
    error: "Ошибка соединения с Telegram",
  }));
  if (result.ok) {
    await prisma.telegramDelivery.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        telegramMessageId: result.messageId,
        nextRetryAt: null,
        error: null,
        errorPayload: Prisma.DbNull,
      },
    });
    return { status: "SENT" as const };
  }
  const attempt = d.attemptCount + 1;
  await prisma.telegramDelivery.update({
    where: { id },
    data: {
      status: "FAILED",
      error: result.error.slice(0, 500),
      errorPayload: Prisma.DbNull,
      nextRetryAt:
        attempt >= 10
          ? null
          : new Date(
              Date.now() + Math.min(21600000, 30000 * 2 ** (attempt - 1)),
            ),
    },
  });
  return { status: "FAILED" as const };
}
export async function sendTelegramToStudentParents(
  studentId: string,
  message: string,
  actor: Actor,
  options: Options = {},
) {
  if (!studentId || !message.trim())
    throw new Error("Ученик и сообщение обязательны");
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: { parents: true },
  });
  if (student.archivedAt)
    return {
      studentId,
      totalParents: 0,
      parentsWithTelegram: 0,
      idempotencyKey: "",
      results: [],
    };
  const parents = student.parents.filter((p) => p.telegramId !== null);
  const key =
    options.idempotencyKey ||
    (options.sourceType && options.sourceId
      ? `${options.sourceType}:${options.sourceId}`
      : crypto
          .createHash("sha256")
          .update(`${studentId}|${message}|${actor.type}|${actor.id || ""}`)
          .digest("hex"));
  await prisma.telegramDelivery.createMany({
    data: parents.map((p) => ({
      studentId,
      parentId: p.id,
      chatId: p.telegramId!,
      messageText: message,
      parseMode: options.parseMode || null,
      actorType: actor.type,
      actorId: actor.id || null,
      sourceType: options.sourceType || null,
      sourceId: options.sourceId || null,
      idempotencyKey: key,
    })),
    skipDuplicates: true,
  });
  const rows = await prisma.telegramDelivery.findMany({
    where: { idempotencyKey: key, parentId: { in: parents.map((p) => p.id) } },
    select: { id: true, parentId: true },
  });
  const results = [];
  for (const row of rows)
    results.push({ parentId: row.parentId, ...(await deliverOne(row.id)) });
  return {
    studentId,
    totalParents: student.parents.length,
    parentsWithTelegram: parents.length,
    idempotencyKey: key,
    results,
  };
}
export async function retryDeliveries(limit = 25) {
  const rows = await prisma.telegramDelivery.findMany({
    where: {
      status: { in: ["FAILED", "PENDING"] },
      attemptCount: { lt: 10 },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: Math.min(50, Math.max(1, limit)),
  });
  const results = [];
  for (const row of rows)
    results.push({ id: row.id, ...(await deliverOne(row.id)) });
  return results;
}
