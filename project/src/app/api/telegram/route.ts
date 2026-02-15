import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { Prisma } from "@prisma/client";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function POST(req: Request) {
  // 1) Security: Secret token header from Telegram
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // 2) Parse JSON
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

  // 3) Idempotency: store update if new
  try {
    const safeJson = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
    await prisma.telegramUpdate.create({
      data: { updateId, payload: safeJson },
    });
  } catch {
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
  const chatId = chatRaw["id"];

  const text = typeof messageRaw["text"] === "string" ? messageRaw["text"] : "";

  const fromRaw = messageRaw["from"];
  if (!isObject(fromRaw) || typeof fromRaw["id"] !== "number") {
    await prisma.telegramUpdate.update({
      where: { updateId },
      data: { status: "IGNORED", processedAt: new Date(), error: "No from.id" },
    });
    return NextResponse.json({ ok: true });
  }
  const fromId = fromRaw["id"];

  // /start <code>
  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    const code = parts[1];

    if (!code) {
      return NextResponse.json({
        method: "sendMessage",
        chat_id: chatId,
        text:
          "Нужен код подключения. Обратитесь к администратору.\n\nUlanish kodi kerak. Administratorga murojaat qiling.",
      });
    }

    try {
      const invite = await prisma.parentInvite.findUnique({
        where: { code },
        include: { student: true },
      });

      if (!invite || invite.status !== "ACTIVE") {
        await prisma.telegramUpdate.update({
          where: { updateId },
          data: { status: "IGNORED", processedAt: new Date(), error: "Invalid invite" },
        });

        return NextResponse.json({
          method: "sendMessage",
          chat_id: chatId,
          text:
            "❌ Неверный или использованный код.\n\n❌ Kod noto‘g‘ri yoki allaqachon ishlatilgan.",
        });
      }

      const firstName = typeof fromRaw["first_name"] === "string" ? fromRaw["first_name"] : "";
      const lastName = typeof fromRaw["last_name"] === "string" ? fromRaw["last_name"] : "";
      const fullName = `${firstName} ${lastName}`.trim() || "Parent";

      const parent = await prisma.parent.upsert({
        where: { telegramId: BigInt(fromId) },
        update: { name: fullName, studentId: invite.studentId },
        create: {
          name: fullName,
          phone: "UNKNOWN",
          telegramId: BigInt(fromId),
          studentId: invite.studentId,
        },
      });

      await prisma.parentInvite.update({
        where: { id: invite.id },
        data: { status: "USED", usedAt: new Date(), parentId: parent.id },
      });

      await prisma.analyticsEvent.create({
        data: {
          name: "parent_linked",
          actorType: "PARENT",
          actorId: parent.id,
          studentId: invite.studentId,
          groupId: invite.student.groupId ?? undefined,
          props: { codeUsed: code },
        },
      });

      await prisma.telegramUpdate.update({
        where: { updateId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });

      return NextResponse.json({
        method: "sendMessage",
        chat_id: chatId,
        text: `📚 EIT LC CRM

🇷🇺 Вы успешно подключены к системе.
Теперь вы будете получать официальные отчёты по ребёнку.

—————————————

🇺🇿 Siz tizimga muvaffaqiyatli ulandingiz.
Endi farzandingiz bo‘yicha hisobotlarni olasiz.`,
      });
    } catch (e) {
      await prisma.telegramUpdate.update({
        where: { updateId },
        data: { status: "ERROR", processedAt: new Date(), error: String(e) },
      });

      return NextResponse.json({
        method: "sendMessage",
        chat_id: chatId,
        text:
          "❌ Ошибка сервера. Обратитесь к администратору.\n\n❌ Server xatosi. Administratorga murojaat qiling.",
      });
    }
  }

  await prisma.telegramUpdate.update({
    where: { updateId },
    data: { status: "IGNORED", processedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
