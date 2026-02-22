import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizePhone(raw: string): string {
  // keep digits and leading +
  const cleaned = raw.replace(/[^\d+]/g, "");
  return cleaned;
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!isObject(body)) return NextResponse.json({ ok: true });

  const updateIdRaw = body["update_id"];
  if (typeof updateIdRaw !== "number") return NextResponse.json({ ok: true });
  const updateId = updateIdRaw;

  // Store update (idempotent)
  try {
    const safeJson = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
    await prisma.telegramUpdate.create({ data: { updateId, payload: safeJson } });
  } catch (err: unknown) {
    const code = isObject(err) ? (err as { code?: string }).code : undefined;
    if (code === "P2002") return NextResponse.json({ ok: true });
    console.error("TG_UPDATE_STORE_ERROR:", err);
    return NextResponse.json({ ok: true });
  }

  const messageRaw = body["message"];
  if (!isObject(messageRaw)) {
    await prisma.telegramUpdate.update({
      where: { updateId },
      data: { status: "IGNORED", processedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  const chatRaw = messageRaw["chat"];
  if (!isObject(chatRaw) || typeof chatRaw["id"] !== "number") {
    await prisma.telegramUpdate.update({
      where: { updateId },
      data: { status: "IGNORED", processedAt: new Date(), error: "No chat.id" },
    });
    return NextResponse.json({ ok: true });
  }

  const chatId = BigInt(chatRaw["id"]);

  const fromRaw = messageRaw["from"];
  const fromId =
    isObject(fromRaw) && typeof fromRaw["id"] === "number" ? fromRaw["id"] : null;

  const text = typeof messageRaw["text"] === "string" ? messageRaw["text"] : "";

  // Contact flow: link by phone
  const contactRaw = messageRaw["contact"];
  if (isObject(contactRaw) && typeof contactRaw["phone_number"] === "string") {
    const contactPhone = normalizePhone(contactRaw["phone_number"]);

    const contactUserId =
      typeof contactRaw["user_id"] === "number" ? contactRaw["user_id"] : null;

    if (!fromId || !contactUserId || contactUserId !== fromId) {
      await sendTelegramMessage(
        chatId,
        "❌ Please send your own phone number using the button."
      );

      await prisma.telegramUpdate.update({
        where: { updateId },
        data: { status: "IGNORED", processedAt: new Date(), error: "Contact user mismatch" },
      });

      return NextResponse.json({ ok: true });
    }

    const parent = await prisma.parent.findFirst({
      where: { phone: contactPhone }, // requires DB phone normalization on admin side
      include: { student: true },
    });

    if (!parent) {
      await sendTelegramMessage(
        chatId,
        "❌ This phone number is not found in EIT system. Please contact admin."
      );

      await prisma.telegramUpdate.update({
        where: { updateId },
        data: { status: "IGNORED", processedAt: new Date(), error: "Phone not found" },
      });

      return NextResponse.json({ ok: true });
    }

    // Store chatId as delivery target (current schema uses telegramId for this)
    await prisma.parent.update({
      where: { id: parent.id },
      data: { telegramId: chatId },
    });

    await prisma.analyticsEvent.create({
      data: {
        name: "parent_linked",
        actorType: "PARENT",
        actorId: parent.id,
        studentId: parent.studentId,
        groupId: parent.student.groupId ?? undefined,
        props: { method: "phone" },
      },
    });

    await prisma.telegramUpdate.update({
      where: { updateId },
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    await sendTelegramMessage(
      chatId,
      "✅ Connected successfully. You will now receive reports."
    );

    return NextResponse.json({ ok: true });
  }

  // /start - simple: ask to share contact (actual keyboard support depends on your sender)
  if (text.startsWith("/start")) {
    await sendTelegramMessage(
      chatId,
      "To connect, please share your phone number (Telegram contact)."
    );

    await prisma.telegramUpdate.update({
      where: { updateId },
      data: { status: "IGNORED", processedAt: new Date(), error: "Start without contact" },
    });

    return NextResponse.json({ ok: true });
  }

  await prisma.telegramUpdate.update({
    where: { updateId },
    data: { status: "IGNORED", processedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
