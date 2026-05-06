import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  answerTelegramCallbackQuery,
  removeTelegramReplyKeyboard,
  sendTelegramContactRequestKeyboard,
  sendTelegramMessage,
  sendTelegramMessageWithInlineKeyboard,
} from "@/lib/telegram";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

function formatParentLookupVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const variants = new Set<string>();
  if (phone) variants.add(phone);
  if (digits) variants.add(digits);
  if (digits.startsWith("998")) variants.add(`+${digits}`);
  if (digits.length >= 9) variants.add(digits.slice(-9));
  return [...variants];
}

function buildConfirmButtons(sessionId: string) {
  return [
    [
      { text: "✅ Да / Ha", callback_data: `link_yes:session:${sessionId}` },
      { text: "❌ Нет / Yo'q", callback_data: `link_no:session:${sessionId}` },
    ],
  ];
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

  try {
    const safeJson = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
    await prisma.telegramUpdate.create({ data: { updateId, payload: safeJson } });
  } catch (err: unknown) {
    const code = isObject(err) ? (err as { code?: string }).code : undefined;
    if (code === "P2002") return NextResponse.json({ ok: true });
    console.error("TG_UPDATE_STORE_ERROR:", err);
    return NextResponse.json({ ok: true });
  }

  try {
    // ── CALLBACK QUERY ────────────────────────────────────
    const callbackRaw = body["callback_query"];
    if (isObject(callbackRaw)) {
      const callbackId = typeof callbackRaw["id"] === "string" ? callbackRaw["id"] : null;
      const callbackData = typeof callbackRaw["data"] === "string" ? callbackRaw["data"] : null;
      const callbackMessage = callbackRaw["message"];
      const chatRaw = isObject(callbackMessage) && isObject(callbackMessage["chat"]) ? callbackMessage["chat"] : null;

      if (!callbackId || !callbackData || !chatRaw || typeof chatRaw["id"] !== "number") {
        await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "IGNORED", processedAt: new Date(), error: "Bad callback_query" } });
        return NextResponse.json({ ok: true });
      }

      const chatId = BigInt(chatRaw["id"]);

      // link_yes:session:<sessionId>
      if (callbackData.startsWith("link_yes:session:")) {
        const sessionId = callbackData.slice("link_yes:session:".length).trim();

        const pendingLinks = await prisma.telegramPendingLink.findMany({
          where: { sessionId, status: "PENDING" },
          include: { parent: true, student: { include: { group: true } } },
        });

        if (pendingLinks.length === 0) {
          await answerTelegramCallbackQuery(callbackId, "Запись не найдена / Yozuv topilmadi");
          await sendTelegramMessage(chatId.toString(), `❌ Запрос не найден или устарел.\n\n❌ So'rov topilmadi yoki eskirgan.`);
          await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "IGNORED", processedAt: new Date(), error: "Session not found" } });
          return NextResponse.json({ ok: true });
        }

        await Promise.all(pendingLinks.map((link) => prisma.parent.update({ where: { id: link.parentId }, data: { telegramId: chatId } })));
        await prisma.telegramPendingLink.updateMany({ where: { sessionId }, data: { status: "CONFIRMED" } });
        await Promise.all(pendingLinks.map((link) =>
          prisma.analyticsEvent.create({
            data: { name: "parent_linked", actorType: "PARENT", actorId: link.parentId, studentId: link.studentId, groupId: link.student.groupId ?? undefined, props: { method: "contact_confirm", sessionId } },
          })
        ));

        await answerTelegramCallbackQuery(callbackId, "Подключено / Ulandi");

        const childrenList = pendingLinks.map((l, i) => `${i + 1}. 👧/👦 ${l.student.name} — ${l.student.group?.name ?? "—"}`).join("\n");

        await removeTelegramReplyKeyboard(
          chatId.toString(),
          `✅ Подключение подтверждено!\n\nВаши дети:\n${childrenList}\n\nТеперь вы будете получать отчёты от EIT LC.\n\n✅ Ulanish tasdiqlandi!\n\nSizning farzandlaringiz:\n${childrenList}\n\nEndi siz EIT LC dan xabarlarni olasiz.`
        );

        await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "PROCESSED", processedAt: new Date() } });
        return NextResponse.json({ ok: true });
      }

      // link_no:session:<sessionId>
      if (callbackData.startsWith("link_no:session:")) {
        const sessionId = callbackData.slice("link_no:session:".length).trim();
        await prisma.telegramPendingLink.updateMany({ where: { sessionId, status: "PENDING" }, data: { status: "REJECTED" } });
        await answerTelegramCallbackQuery(callbackId, "Принято / Qabul qilindi");
        await sendTelegramMessage(chatId.toString(), `❌ Подключение отменено. Обратитесь к администратору EIT.\n\n❌ Ulanish bekor qilindi. EIT administratoriga murojaat qiling.`);
        await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "PROCESSED", processedAt: new Date() } });
        return NextResponse.json({ ok: true });
      }

      await answerTelegramCallbackQuery(callbackId, "Неизвестная команда / Noma'lum buyruq");
      await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "IGNORED", processedAt: new Date(), error: "Unknown callback_data" } });
      return NextResponse.json({ ok: true });
    }

    // ── MESSAGE FLOW ──────────────────────────────────────
    const messageRaw = body["message"];
    if (!isObject(messageRaw)) {
      await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "IGNORED", processedAt: new Date(), error: "No message object" } });
      return NextResponse.json({ ok: true });
    }

    const chatRaw = messageRaw["chat"];
    if (!isObject(chatRaw) || typeof chatRaw["id"] !== "number") {
      await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "IGNORED", processedAt: new Date(), error: "No chat.id" } });
      return NextResponse.json({ ok: true });
    }

    const chatId = BigInt(chatRaw["id"]);
    const fromRaw = messageRaw["from"];
    const fromId = isObject(fromRaw) && typeof fromRaw["id"] === "number" ? fromRaw["id"] : null;
    const text = typeof messageRaw["text"] === "string" ? messageRaw["text"] : "";

    // /start
    if (text.startsWith("/start")) {
      await sendTelegramContactRequestKeyboard(chatId.toString(), `Здравствуйте! Отправьте свой номер телефона кнопкой ниже.\n\nAssalomu alaykum! Quyidagi tugma orqali telefon raqamingizni yuboring.`);
      await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "PROCESSED", processedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }

    // Contact
    const contactRaw = messageRaw["contact"];
    if (isObject(contactRaw) && typeof contactRaw["phone_number"] === "string") {
      const contactPhone = normalizePhone(contactRaw["phone_number"]);
      const contactUserId = typeof contactRaw["user_id"] === "number" ? contactRaw["user_id"] : null;

      if (!fromId || !contactUserId || contactUserId !== fromId) {
        await sendTelegramMessage(chatId.toString(), `❌ Пожалуйста, отправьте свой собственный номер.\n\n❌ Iltimos, o'zingizning raqamingizni yuboring.`);
        await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "IGNORED", processedAt: new Date(), error: "Contact user mismatch" } });
        return NextResponse.json({ ok: true });
      }

      const phoneVariants = formatParentLookupVariants(contactPhone);

      const parents = await prisma.parent.findMany({
        where: { OR: phoneVariants.map((p) => ({ phone: p })) },
        include: { student: { include: { group: true } } },
      });

      if (parents.length === 0) {
        await sendTelegramMessage(chatId.toString(), `❌ Номер не найден в системе EIT. Обратитесь к администратору.\n\n❌ Raqam EIT tizimida topilmadi. Administratorga murojaat qiling.`);
        await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "IGNORED", processedAt: new Date(), error: "Phone not found" } });
        return NextResponse.json({ ok: true });
      }

      const sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

      // Expire old pending links from this chatId
      await prisma.telegramPendingLink.updateMany({ where: { chatId, status: "PENDING" }, data: { status: "REJECTED" } });

      // Create one pending link per child
      await Promise.all(
        parents.map((parent) =>
          prisma.telegramPendingLink.create({
            data: { sessionId, chatId, parentId: parent.id, studentId: parent.studentId, status: "PENDING", expiresAt },
          })
        )
      );

      const isSingle = parents.length === 1;
      const childrenListRu = parents.map((p, i) => `${i + 1}. 👧/👦 ${p.student.name}\n    Группа: ${p.student.group?.name ?? "не назначена"}`).join("\n");
      const childrenListUz = parents.map((p, i) => `${i + 1}. 👧/👦 ${p.student.name}\n    Guruh: ${p.student.group?.name ?? "belgilanmagan"}`).join("\n");

      const msgRu = isSingle
        ? `Подтвердите данные:\n\nЭто ваш ребёнок?\n${childrenListRu}\n\nНажмите «Да», если всё верно.`
        : `Подтвердите данные:\n\nЭто ваши дети?\n${childrenListRu}\n\nНажмите «Да», чтобы подключить все аккаунты.`;

      const msgUz = isSingle
        ? `Ma'lumotlarni tasdiqlang:\n\nBu sizning farzandingizmi?\n${childrenListUz}\n\n«Ha» tugmasini bosing.`
        : `Ma'lumotlarni tasdiqlang:\n\nBular sizning farzandlaringizmi?\n${childrenListUz}\n\nBarcha hisoblarni ulash uchun «Ha» tugmasini bosing.`;

      await sendTelegramMessageWithInlineKeyboard(chatId.toString(), `${msgRu}\n\n${msgUz}`, buildConfirmButtons(sessionId));
      await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "PROCESSED", processedAt: new Date() } });
      return NextResponse.json({ ok: true });
    }

    await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "IGNORED", processedAt: new Date() } });
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("TG_ROUTE_ERROR:", err);
    try {
      await prisma.telegramUpdate.update({ where: { updateId }, data: { status: "IGNORED", processedAt: new Date(), error: "Unhandled route error" } });
    } catch { /* ignore */ }
    return NextResponse.json({ ok: true });
  }
}