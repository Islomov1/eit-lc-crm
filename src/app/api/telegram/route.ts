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

export const runtime = "nodejs";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizePhone(raw: string): string {
  // Оставляем цифры и +
  return raw.replace(/[^\d+]/g, "");
}

function formatParentLookupVariants(phone: string): string[] {
  // Чтобы повысить шанс совпадения, пробуем несколько вариантов
  const digits = phone.replace(/\D/g, "");
  const variants = new Set<string>();

  if (phone) variants.add(phone);
  if (digits) variants.add(digits);
  if (digits.startsWith("998")) {
    variants.add(`+${digits}`);
  }
  if (digits.length >= 9) {
    variants.add(digits.slice(-9)); // последние 9 цифр
  }

  return [...variants];
}

function buildConfirmButtons(pendingId: string) {
  return [
    [
      {
        text: "✅ Да / Ha",
        callback_data: `link_yes:${pendingId}`,
      },
      {
        text: "❌ Нет / Yo‘q",
        callback_data: `link_no:${pendingId}`,
      },
    ],
  ];
}

export async function POST(req: Request) {
  // 1) Secret check
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // 2) Parse JSON body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!isObject(body)) return NextResponse.json({ ok: true });

  // 3) update_id
  const updateIdRaw = body["update_id"];
  if (typeof updateIdRaw !== "number") return NextResponse.json({ ok: true });
  const updateId = updateIdRaw;

  // 4) Store update (idempotent)
  try {
    const safeJson = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
    await prisma.telegramUpdate.create({
      data: {
        updateId,
        payload: safeJson,
      },
    });
  } catch (err: unknown) {
    const code = isObject(err) ? (err as { code?: string }).code : undefined;
    if (code === "P2002") return NextResponse.json({ ok: true });
    console.error("TG_UPDATE_STORE_ERROR:", err);
    return NextResponse.json({ ok: true });
  }

  try {
    // =========================================================
    // A) CALLBACK QUERY (inline buttons Да / Нет)
    // =========================================================
    const callbackRaw = body["callback_query"];
    if (isObject(callbackRaw)) {
      const callbackId =
        typeof callbackRaw["id"] === "string" ? callbackRaw["id"] : null;

      const callbackData =
        typeof callbackRaw["data"] === "string" ? callbackRaw["data"] : null;

      const callbackMessage = callbackRaw["message"];
      const chatRaw =
        isObject(callbackMessage) && isObject(callbackMessage["chat"])
          ? callbackMessage["chat"]
          : null;

      if (!callbackId || !callbackData || !chatRaw || typeof chatRaw["id"] !== "number") {
        await prisma.telegramUpdate.update({
          where: { updateId },
          data: { status: "IGNORED", processedAt: new Date(), error: "Bad callback_query" },
        });
        return NextResponse.json({ ok: true });
      }

      const chatId = BigInt(chatRaw["id"]);

      // link_yes:<pendingId>
      if (callbackData.startsWith("link_yes:")) {
        const pendingId = callbackData.slice("link_yes:".length).trim();

        const pending = await prisma.telegramPendingLink.findUnique({
          where: { id: pendingId },
          include: {
            parent: true,
            student: { include: { group: true } },
          },
        });

        if (!pending) {
          await answerTelegramCallbackQuery(callbackId, "Запись не найдена / Yozuv topilmadi");
          await sendTelegramMessage(
            chatId.toString(),
            `❌ Запрос подтверждения не найден или устарел.

❌ Tasdiqlash so‘rovi topilmadi yoki eskirgan.`
          );

          await prisma.telegramUpdate.update({
            where: { updateId },
            data: { status: "IGNORED", processedAt: new Date(), error: "Pending link not found" },
          });

          return NextResponse.json({ ok: true });
        }

        if (pending.status !== "PENDING") {
          await answerTelegramCallbackQuery(
            callbackId,
            "Уже обработано / Allaqachon qayta ishlangan"
          );

          await sendTelegramMessage(
            chatId.toString(),
            `ℹ️ Этот запрос уже обработан.

ℹ️ Bu so‘rov allaqachon qayta ishlangan.`
          );

          await prisma.telegramUpdate.update({
            where: { updateId },
            data: { status: "IGNORED", processedAt: new Date(), error: "Pending not PENDING" },
          });

          return NextResponse.json({ ok: true });
        }

        // Привязываем чат к родителю
        await prisma.parent.update({
          where: { id: pending.parentId },
          data: { telegramId: chatId },
        });

        await prisma.telegramPendingLink.update({
          where: { id: pending.id },
          data: { status: "CONFIRMED" },
        });

        await prisma.analyticsEvent.create({
          data: {
            name: "parent_linked",
            actorType: "PARENT",
            actorId: pending.parentId,
            studentId: pending.studentId,
            groupId: pending.student.groupId ?? undefined,
            props: { method: "contact_confirm" },
          },
        });

        await answerTelegramCallbackQuery(callbackId, "Подключено / Ulandi");

        await removeTelegramReplyKeyboard(
          chatId.toString(),
          `✅ Подключение подтверждено.

Ученик: ${pending.student.name}
Группа: ${pending.student.group?.name ?? "-"}

Теперь вы будете получать отчёты и сообщения от EIT LC.

✅ Ulanish tasdiqlandi.

O‘quvchi: ${pending.student.name}
Guruh: ${pending.student.group?.name ?? "-"}

Endi siz EIT LC dan hisobotlar va xabarlarni olasiz.`
        );

        await prisma.telegramUpdate.update({
          where: { updateId },
          data: { status: "PROCESSED", processedAt: new Date() },
        });

        return NextResponse.json({ ok: true });
      }

      // link_no:<pendingId>
      if (callbackData.startsWith("link_no:")) {
        const pendingId = callbackData.slice("link_no:".length).trim();

        const pending = await prisma.telegramPendingLink.findUnique({
          where: { id: pendingId },
        });

        if (pending && pending.status === "PENDING") {
          await prisma.telegramPendingLink.update({
            where: { id: pending.id },
            data: { status: "REJECTED" },
          });
        }

        await answerTelegramCallbackQuery(callbackId, "Принято / Qabul qilindi");

        await sendTelegramMessage(
          chatId.toString(),
          `❌ Подключение отменено. Пожалуйста, обратитесь к администратору EIT.

❌ Ulanish bekor qilindi. Iltimos, EIT administratoriga murojaat qiling.`
        );

        await prisma.telegramUpdate.update({
          where: { updateId },
          data: { status: "PROCESSED", processedAt: new Date() },
        });

        return NextResponse.json({ ok: true });
      }

      // Неизвестная callback data
      await answerTelegramCallbackQuery(callbackId, "Неизвестная команда / Noma’lum buyruq");

      await prisma.telegramUpdate.update({
        where: { updateId },
        data: { status: "IGNORED", processedAt: new Date(), error: "Unknown callback_data" },
      });

      return NextResponse.json({ ok: true });
    }

    // =========================================================
    // B) MESSAGE FLOW (/start, contact, etc.)
    // =========================================================
    const messageRaw = body["message"];
    if (!isObject(messageRaw)) {
      await prisma.telegramUpdate.update({
        where: { updateId },
        data: { status: "IGNORED", processedAt: new Date(), error: "No message object" },
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

    // /start
    if (text.startsWith("/start")) {
      await sendTelegramContactRequestKeyboard(
        chatId.toString(),
        `Здравствуйте! Для подключения родительского Telegram к системе EIT отправьте свой номер телефона кнопкой ниже.

Assalomu alaykum! EIT tizimiga ota-ona Telegramini ulash uchun quyidagi tugma orqali telefon raqamingizni yuboring.`
      );

      await prisma.telegramUpdate.update({
        where: { updateId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });

      return NextResponse.json({ ok: true });
    }

    // Contact flow
    const contactRaw = messageRaw["contact"];
    if (isObject(contactRaw) && typeof contactRaw["phone_number"] === "string") {
      const contactPhone = normalizePhone(contactRaw["phone_number"]);
      const contactUserId =
        typeof contactRaw["user_id"] === "number" ? contactRaw["user_id"] : null;

      // Пользователь должен отправить СВОЙ контакт
      if (!fromId || !contactUserId || contactUserId !== fromId) {
        await sendTelegramMessage(
          chatId.toString(),
          `❌ Пожалуйста, отправьте свой собственный номер через кнопку контакта.

❌ Iltimos, kontakt tugmasi orqali aynan o‘zingizning raqamingizni yuboring.`
        );

        await prisma.telegramUpdate.update({
          where: { updateId },
          data: { status: "IGNORED", processedAt: new Date(), error: "Contact user mismatch" },
        });

        return NextResponse.json({ ok: true });
      }

      const phoneVariants = formatParentLookupVariants(contactPhone);

      // Ищем родителя по нескольким вариантам номера
      const parent = await prisma.parent.findFirst({
        where: {
          OR: phoneVariants.map((p) => ({ phone: p })),
        },
        include: {
          student: {
            include: {
              group: true,
            },
          },
        },
      });

      if (!parent) {
        await sendTelegramMessage(
          chatId.toString(),
          `❌ Этот номер не найден в системе EIT. Обратитесь к администратору.

❌ Bu raqam EIT tizimida topilmadi. Administratorga murojaat qiling.`
        );

        await prisma.telegramUpdate.update({
          where: { updateId },
          data: { status: "IGNORED", processedAt: new Date(), error: "Phone not found" },
        });

        return NextResponse.json({ ok: true });
      }

      // Создаём/обновляем pending link для этого chatId
      const pending = await prisma.telegramPendingLink.upsert({
        where: { chatId },
        update: {
          parentId: parent.id,
          studentId: parent.studentId,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 1000 * 60 * 15), // 15 мин
        },
        create: {
          chatId,
          parentId: parent.id,
          studentId: parent.studentId,
          status: "PENDING",
          expiresAt: new Date(Date.now() + 1000 * 60 * 15),
        },
      });

      // Показываем подтверждение с кнопками
      await sendTelegramMessageWithInlineKeyboard(
        chatId.toString(),
        `Пожалуйста, подтвердите данные:

Это ваш ребёнок?
👧/👦 ${parent.student.name}
Группа: ${parent.student.group?.name ?? "-"}

Пожалуйста, нажмите «Да», если всё верно.

Ma’lumotlarni tasdiqlang:

Bu sizning farzandingizmi?
👧/👦 ${parent.student.name}
Guruh: ${parent.student.group?.name ?? "-"}

Hammasi to‘g‘ri bo‘lsa, «Ha» tugmasini bosing.`,
        buildConfirmButtons(pending.id)
      );

      await prisma.telegramUpdate.update({
        where: { updateId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });

      return NextResponse.json({ ok: true });
    }

    // Остальные сообщения
    await prisma.telegramUpdate.update({
      where: { updateId },
      data: { status: "IGNORED", processedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("TG_ROUTE_ERROR:", err);

    try {
      await prisma.telegramUpdate.update({
        where: { updateId },
        data: { status: "IGNORED", processedAt: new Date(), error: "Unhandled route error" },
      });
    } catch {
      // ignore secondary error
    }

    return NextResponse.json({ ok: true });
  }
}