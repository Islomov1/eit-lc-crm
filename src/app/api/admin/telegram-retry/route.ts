import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TelegramDeliveryStatus } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const h1 = req.headers.get("x-cron-secret");
  if (h1 && h1 === secret) return true;

  const auth = req.headers.get("authorization");
  if (auth && auth === `Bearer ${secret}`) return true;

  // fallback: query param (на крайний случай)
  const url = new URL(req.url);
  const qs = url.searchParams.get("secret");
  if (qs && qs === secret) return true;

  return false;
}

function backoffMs(attempt: number) {
  // 30s, 60s, 120s... cap 6h + jitter
  const base = 30_000;
  const cap = 6 * 60 * 60_000;
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 5_000);
  return exp + jitter;
}

/**
 * Cron endpoint:
 * - берёт FAILED (и PENDING при желании) с nextRetryAt <= now
 * - шлёт
 * - пишет SENT/FAILED + ошибки
 * - защищается от гонок через "claim" updateMany
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const includePending = url.searchParams.get("includePending") === "1";

  const now = new Date();
  const maxAttempts = 10;

  // Берём кандидатов (FAILED + optionally PENDING)
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
    // Claim: чтобы два cron-а/два процесса не отправили одно и то же
    // Мы "захватываем" запись и увеличиваем attemptCount
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
        // очищаем старую ошибку перед новой попыткой
        error: null,
        errorPayload: null,
      },
    });

    if (claim.count === 0) {
      skipped++;
      details.push({ id: d.id, status: "SKIPPED" });
      continue;
    }

    processed++;

    // перечитываем, чтобы получить актуальный attemptCount (после increment)
    const fresh = await prisma.telegramDelivery.findUnique({ where: { id: d.id } });
    const attempt = fresh?.attemptCount ?? d.attemptCount + 1;

    const tg = await sendTelegramMessage(d.chatId, d.messageText, {
      parseMode: (d.parseMode as any) ?? undefined,
    });

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
          errorPayload: null,
        },
      });

      details.push({ id: d.id, status: "SENT" });
    } else {
      failed++;

      // если уже достигли лимита попыток — прекращаем планировать retry
      const nextRetryAt =
        attempt >= maxAttempts ? null : new Date(Date.now() + backoffMs(attempt));

      await prisma.telegramDelivery.update({
        where: { id: d.id },
        data: {
          status: TelegramDeliveryStatus.FAILED,
          nextRetryAt,
          error: tg.error,
          errorPayload: (tg as any).payload ?? null,
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

// Удобно для ручного теста из браузера/URL (если нужно)
export async function GET(req: Request) {
  // Делегируем на POST (чтобы можно было дернуть curl без -X POST)
  return POST(req);
}
