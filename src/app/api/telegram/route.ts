import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { sendTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizePhone(raw: string): string {
  // оставляем цифры и плюс
  return raw.replace(/[^\d+]/g, "");
}

function getStartPayload(text: string): string | null {
  // "/start" или "/start eitxxxx"
  const trimmed = text.trim();
  if (!trimmed.startsWith("/start")) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  const payload = parts.slice(1).join(" ").trim();
  return payload || null;
}

export async function POST(req: Request) {
  // 1) Проверка секретного заголовка webhook
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // 2) Парсим body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!isObject(body)) return NextResponse.json({ ok: true });

  // 3) update_id (для идемпотентности)
  const updateIdRaw = body["update_id"];
  if (typeof updateIdRaw !== "number") return NextResponse.json({ ok: true });
  const updateId = updateIdRaw;

  // 4) Сохраняем update в таблицу (если дубль — просто выходим)
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

    // P2002 = duplicate unique (update уже сохранён)
    if (code === "P2002") {
      return NextResponse.json({ ok: true });
    }

    console.error("TG_UPDATE_STORE_ERROR:", err);
    return NextResponse.json({ ok: true });
  }

  // 5) Достаём message
  const messageRaw = body["message"];
  if (!isObject(messageRaw)) {
    await prisma.telegramUpdate.update({
      where: { updateId },
      data: {
        status: "IGNORED",
        processedAt: new Date(),
        error: "No message object",
      },
    });
    return NextResponse.json({ ok: true });
  }

  // 6) chat.id обязателен
  const chatRaw = messageRaw["chat"];
  if (!isObject(chatRaw) || typeof chatRaw["id"] !== "number") {
    await prisma.telegramUpdate.update({
      where: { updateId },
      data: {
        status: "IGNORED",
        processedAt: new Date(),
        error: "No chat.id",
      },
    });
    return NextResponse.json({ ok: true });
  }

  const chatId = BigInt(chatRaw["id"]);

  // from.id (для проверки contact.user_id === from.id)
  const fromRaw = messageRaw["from"];
  const fromId =
    isObject(fromRaw) && typeof fromRaw["id"] === "number" ? fromRaw["id"] : null;

  // text (если есть)
  const text = typeof messageRaw["text"] === "string" ? messageRaw["text"] : "";

  /* =========================================================
     A) /start FLOW (invite-link)
     ========================================================= */
  if (text.startsWith("/start")) {
    const payload = getStartPayload(text);

    // Есть payload => пытаемся привязать по invite code
    if (payload) {
      try {
        const invite = await prisma.parentInvite.findUnique({
          where: { code: payload },
          select: {
            id: true,
            code: true,
            status: true,
            studentId: true,
          },
        });

        if (!invite) {
          await sendTelegramMessage(
            chatId.toString(),
            `❌ Ссылка недействительна. Попросите администратора отправить новую ссылку.

❌ Havola yaroqsiz. Administratorдан yangi havola so‘rang.`
          );

          await prisma.telegramUpdate.update({
            where: { updateId },
            data: {
              status: "IGNORED",
              processedAt: new Date(),
              error: `Invite not found: ${payload}`,
            },
          });

          return NextResponse.json({ ok: true });
        }

        // Если статус не ACTIVE — invite уже использован/неактивен
        // (если у тебя enum, и TS ругнётся на строки - скажу как быстро поправить)
        if (invite.status !== "ACTIVE") {
          await sendTelegramMessage(
            chatId.toString(),
            `ℹ️ Эта ссылка уже использована или неактивна.

ℹ️ Bu havola allaqachon ishlatilgan yoki faol emas.`
          );

          await prisma.telegramUpdate.update({
            where: { updateId },
            data: {
              status: "IGNORED",
              processedAt: new Date(),
              error: `Invite inactive: ${String(invite.status)}`,
            },
          });

          return NextResponse.json({ ok: true });
        }

        const student = await prisma.student.findUnique({
          where: { id: invite.studentId },
          include: { parents: true, group: true },
        });

        if (!student) {
          await sendTelegramMessage(
            chatId.toString(),
            `❌ Ученик по этой ссылке не найден. Обратитесь к администратору.

❌ Ushbu havola bo‘yicha o‘quvchi topilmadi. Administratorga murojaat qiling.`
          );

          await prisma.telegramUpdate.update({
            where: { updateId },
            data: {
              status: "IGNORED",
              processedAt: new Date(),
              error: "Invite student not found",
            },
          });

          return NextResponse.json({ ok: true });
        }

        // Практичное решение:
        // привязываем первого родителя этого ученика без telegramId
        const targetParent = student.parents.find((p) => p.telegramId == null);

        // Если все родители уже привязаны
        if (!targetParent) {
          await sendTelegramMessage(
            chatId.toString(),
            `ℹ️ Для ученика ${student.name} Telegram уже подключён.

ℹ️ ${student.name} o‘quvchisi uchun Telegram allaqachon ulangan.`
          );

          await prisma.telegramUpdate.update({
            where: { updateId },
            data: {
              status: "PROCESSED",
              processedAt: new Date(),
              error: "All parents already linked",
            },
          });

          return NextResponse.json({ ok: true });
        }

        // Сохраняем chat_id в Parent.telegramId (у тебя BigInt)
        await prisma.parent.update({
          where: { id: targetParent.id },
          data: {
            telegramId: chatId,
          },
        });

        // Меняем статус invite
        await prisma.parentInvite.update({
          where: { id: invite.id },
          data: {
            status: "USED",
            // usedAt: new Date(), // включи, если поле есть в schema
          },
        });

        // Аналитика (если модель/enum совпадают с твоей схемой)
        await prisma.analyticsEvent.create({
          data: {
            name: "parent_linked",
            actorType: "PARENT",
            actorId: targetParent.id,
            studentId: student.id,
            groupId: student.groupId ?? undefined,
            props: {
              method: "invite",
              inviteCode: invite.code,
            },
          },
        });

        await prisma.telegramUpdate.update({
          where: { updateId },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
          },
        });

        await sendTelegramMessage(
          chatId.toString(),
          `✅ Подключение выполнено успешно.

Ученик: ${student.name}
Группа: ${student.group?.name ?? "-"}

Теперь вы будете получать сообщения и отчёты от EIT LC.

✅ Ulanish muvaffaqiyatli bajarildi.

O‘quvchi: ${student.name}
Guruh: ${student.group?.name ?? "-"}

Endi siz EIT LC dan xabarlar va hisobotlarni olasiz.`
        );

        return NextResponse.json({ ok: true });
      } catch (err: unknown) {
        console.error("INVITE_LINK_ERROR:", err);

        await prisma.telegramUpdate.update({
          where: { updateId },
          data: {
            status: "IGNORED",
            processedAt: new Date(),
            error: "Invite link DB update failed",
          },
        });

        await sendTelegramMessage(
          chatId.toString(),
          `❌ Не удалось завершить подключение. Обратитесь к администратору.

❌ Ulanishni yakunlab bo‘lmadi. Administratorga murojaat qiling.`
        );

        return NextResponse.json({ ok: true });
      }
    }

    // /start без payload => просим отправить контакт
    await sendTelegramMessage(
      chatId.toString(),
      `Чтобы подключиться, отправьте свой номер телефона через кнопку контакта в Telegram.

Ulanish uchun Telegramdagi kontakt tugmasi orqali telefon raqamingizni yuboring.`
    );

    await prisma.telegramUpdate.update({
      where: { updateId },
      data: {
        status: "IGNORED",
        processedAt: new Date(),
        error: "Start without payload",
      },
    });

    return NextResponse.json({ ok: true });
  }

  /* =========================================================
     B) CONTACT FLOW (link by phone)
     ========================================================= */
  const contactRaw = messageRaw["contact"];
  if (isObject(contactRaw) && typeof contactRaw["phone_number"] === "string") {
    const contactPhone = normalizePhone(contactRaw["phone_number"]);

    const contactUserId =
      typeof contactRaw["user_id"] === "number" ? contactRaw["user_id"] : null;

    // Важно: принимаем только если пользователь отправил СВОЙ контакт
    if (!fromId || !contactUserId || contactUserId !== fromId) {
      await sendTelegramMessage(
        chatId.toString(),
        `❌ Пожалуйста, отправьте свой собственный номер через кнопку контакта.

❌ Iltimos, kontakt tugmasi orqali aynan o‘zingizning raqamingizni yuboring.`
      );

      await prisma.telegramUpdate.update({
        where: { updateId },
        data: {
          status: "IGNORED",
          processedAt: new Date(),
          error: "Contact user mismatch",
        },
      });

      return NextResponse.json({ ok: true });
    }

    const parent = await prisma.parent.findFirst({
      where: { phone: contactPhone }, // номер в БД должен быть в сопоставимом формате
      include: { student: true },
    });

    if (!parent) {
      await sendTelegramMessage(
        chatId.toString(),
        `❌ Этот номер не найден в системе EIT. Обратитесь к администратору.

❌ Bu raqam EIT tizimida topilmadi. Administratorga murojaat qiling.`
      );

      await prisma.telegramUpdate.update({
        where: { updateId },
        data: {
          status: "IGNORED",
          processedAt: new Date(),
          error: "Phone not found",
        },
      });

      return NextResponse.json({ ok: true });
    }

    // Сохраняем chatId в Parent.telegramId
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
      chatId.toString(),
      `✅ Подключение выполнено успешно. Теперь вы будете получать отчёты.

✅ Ulanish muvaffaqiyatli bajarildi. Endi siz hisobotlarni olasiz.`
    );

    return NextResponse.json({ ok: true });
  }

  /* =========================================================
     C) OTHER MESSAGES
     ========================================================= */
  await prisma.telegramUpdate.update({
    where: { updateId },
    data: {
      status: "IGNORED",
      processedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}