// src/app/api/cron/telegram-deliveries/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, TelegramDeliveryStatus } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram";
import type { TelegramParseMode, TelegramSendResult } from "@/lib/telegram";

export const runtime = "nodejs";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const h1 = req.headers.get("x-cron-secret");
  if (h1 === secret) return true;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  return false;
}

function backoffMs(attempt: number) {
  const base = 30_000;
  const cap = 6 * 60 * 60_000;
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 5_000);
  return exp + jitter;
}

function normalizeParseMode(mode: string | null | undefined): TelegramParseMode | undefined {
  if (mode === "HTML" || mode === "MarkdownV2") return mode;
  return undefined;
}

function toJsonSafe(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return Prisma.DbNull;
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const includePending = url.searchParams.get("includePending") === "1";

  const now = new Date();
  const maxAttempts = 10;

  const batch = await prisma.telegramDelivery.findMany({
    where: {
      status: includePending
        ? { in: [TelegramDeliveryStatus.FAILED, TelegramDeliveryStatus.PENDING] }
        : TelegramDeliveryStatus.FAILED,
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      attemptCount: { lt: maxAttempts },
    },
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const details: Array<{ id: string; status: "SENT" | "FAILED" | "SKIPPED"; error?: string }> = [];

  for (const d of batch) {
    const claim = await prisma.telegramDelivery.updateMany({
      where: {
        id: d.id,
        status: { in: [TelegramDeliveryStatus.FAILED, TelegramDeliveryStatus.PENDING] },
        attemptCount: { lt: maxAttempts },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        error: null,
        errorPayload: Prisma.DbNull,
      },
    });

    if (claim.count === 0) {
      skipped++;
      details.push({ id: d.id, status: "SKIPPED" });
      continue;
    }

    processed++;

    const attempt = d.attemptCount + 1;

    let tg: TelegramSendResult;
    try {
      tg = await sendTelegramMessage(d.chatId, d.messageText, {
        parseMode: normalizeParseMode(d.parseMode),
      });
    } catch (err: unknown) {
      const safePayload =
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : err;

      const msg = err instanceof Error ? err.message : "sendTelegramMessage threw";
      tg = { ok: false, error: msg, payload: safePayload };
    }

    if (tg.ok) {
      sent++;

      await prisma.telegramDelivery.update({
        where: { id: d.id },
        data: {
          status: TelegramDeliveryStatus.SENT,
          sentAt: new Date(),
          telegramMessageId: tg.messageId,
          nextRetryAt: null,
          error: null,
          errorPayload: Prisma.DbNull,
        },
      });

      details.push({ id: d.id, status: "SENT" });
    } else {
      failed++;

      const nextRetryAt =
        attempt >= maxAttempts ? null : new Date(Date.now() + backoffMs(attempt));

      await prisma.telegramDelivery.update({
        where: { id: d.id },
        data: {
          status: TelegramDeliveryStatus.FAILED,
          nextRetryAt,
          error: tg.error,
          errorPayload: toJsonSafe("payload" in tg ? tg.payload : null),
        },
      });

      details.push({ id: d.id, status: "FAILED", error: tg.error });
    }
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    limit,
    includePending,
    maxAttempts,
    fetched: batch.length,
    processed,
    sent,
    failed,
    skipped,
    details,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
