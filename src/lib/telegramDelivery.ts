// src/lib/telegramDelivery.ts
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { TelegramDeliveryStatus } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram";

type Actor =
  | { type: "USER"; id: string }
  | { type: "PARENT"; id: string }
  | { type: "SYSTEM"; id?: string };

type SendOptions = {
  parseMode?: "HTML" | "MarkdownV2";
  sourceType?: string;
  sourceId?: string;
  idempotencyKey?: string;
  force?: boolean; // игнорировать nextRetryAt
};

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function backoffMs(attempt: number) {
  // 30s, 60s, 120s... cap 6h + jitter
  const base = 30_000;
  const cap = 6 * 60 * 60_000;
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 5_000);
  return exp + jitter;
}

export async function sendTelegramToStudentParents(
  studentId: string,
  message: string,
  actor: Actor,
  options: SendOptions = {}
) {
  if (!studentId) throw new Error("studentId is required");
  if (!message?.trim()) throw new Error("message is required");

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { parents: true },
  });
  if (!student) throw new Error(`Student not found: ${studentId}`);

  const parents = student.parents.filter((p) => p.telegramId !== null);
  const now = new Date();

  const baseKey =
    options.idempotencyKey ??
    (options.sourceType && options.sourceId
      ? `${options.sourceType}:${options.sourceId}`
      : sha256(`${studentId}|${message}|${actor.type}|${"id" in actor ? actor.id ?? "" : ""}`));

  // 1) создаём delivery строки (если уже есть — skip)
  await prisma.telegramDelivery.createMany({
    data: parents.map((p) => ({
      studentId,
      parentId: p.id,
      chatId: p.telegramId as bigint,
      messageText: message,
      parseMode: options.parseMode ?? null,
      actorType: actor.type,
      actorId: "id" in actor ? (actor.id ?? null) : null,
      sourceType: options.sourceType ?? null,
      sourceId: options.sourceId ?? null,
      idempotencyKey: baseKey,
    })),
    skipDuplicates: true,
  });

  // 2) берём записи и отправляем (без дублей)
  const deliveries = await prisma.telegramDelivery.findMany({
    where: {
      idempotencyKey: baseKey,
      parentId: { in: parents.map((p) => p.id) },
    },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{
    parentId: string;
    status: "SENT" | "FAILED" | "PENDING";
    error?: string;
  }> = [];

  for (const d of deliveries) {
    if (d.status === TelegramDeliveryStatus.SENT) {
      results.push({ parentId: d.parentId, status: "SENT" });
      continue;
    }

    if (!options.force && d.nextRetryAt && d.nextRetryAt.getTime() > now.getTime()) {
      results.push({ parentId: d.parentId, status: "PENDING", error: d.error ?? undefined });
      continue;
    }

    // claim attempt (чтобы параллельные вызовы меньше дублировали)
    const claimed = await prisma.telegramDelivery.updateMany({
      where: {
        id: d.id,
        status: { in: [TelegramDeliveryStatus.PENDING, TelegramDeliveryStatus.FAILED] },
      },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        error: null,
        errorPayload: null,
      },
    });

    if (claimed.count === 0) {
      results.push({ parentId: d.parentId, status: "PENDING" });
      continue;
    }

    const fresh = await prisma.telegramDelivery.findUnique({ where: { id: d.id } });
    const attempt = fresh?.attemptCount ?? d.attemptCount + 1;

    const tg = await sendTelegramMessage(d.chatId, d.messageText, {
      parseMode: (d.parseMode as any) ?? undefined,
    });

    if (tg.ok) {
      await prisma.telegramDelivery.update({
        where: { id: d.id },
        data: {
          status: TelegramDeliveryStatus.SENT,
          sentAt: new Date(),
          telegramMessageId: tg.messageId,
          nextRetryAt: null,
          error: null,
          errorPayload: null,
        },
      });

      results.push({ parentId: d.parentId, status: "SENT" });
    } else {
      const nextRetryAt = new Date(Date.now() + backoffMs(attempt));
      await prisma.telegramDelivery.update({
        where: { id: d.id },
        data: {
          status: TelegramDeliveryStatus.FAILED,
          nextRetryAt,
          error: tg.error,
          errorPayload: tg.payload ?? null,
        },
      });

      results.push({ parentId: d.parentId, status: "FAILED", error: tg.error });
    }
  }

  return {
    studentId,
    idempotencyKey: baseKey,
    totalParents: student.parents.length,
    parentsWithTelegram: parents.length,
    results,
  };
}
