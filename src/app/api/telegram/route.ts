import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();

  const message = body.message;

  if (!message) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id.toString();
  const text: string = message.text || "";

  // Если это команда /start
  if (text.startsWith("/start")) {
    const parts = text.split(" ");
    const studentId = parts[1]; // параметр после start

    if (!studentId) {
      return NextResponse.json({ ok: true });
    }

    // Находим родителя без telegramId
    const parent = await prisma.parent.findFirst({
      where: {
        studentId,
        telegramId: null,
      },
    });

    if (parent) {
      await prisma.parent.update({
        where: { id: parent.id },
        data: {
          telegramId: chatId,
        },
      });

      return NextResponse.json({
  method: "sendMessage",
  chat_id: chatId,
  text: `📚 EIT LC CRM

🇷🇺 Вы успешно подключены к системе EIT LC CRM.
Теперь вы будете получать официальные отчёты о посещаемости и выполнении домашнего задания вашего ребёнка.

Если у вас возникнут вопросы, пожалуйста, свяжитесь с администрацией учебного центра.

—————————————

🇺🇿 Siz EIT LC CRM tizimiga muvaffaqiyatli ulandingiz.
Endilikda farzandingizning darsga qatnashuvi va uy vazifalari bo‘yicha rasmiy hisobotlarni qabul qilib borasiz.

Savollar yuzasidan o‘quv markazi ma’muriyati bilan bog‘lanishingiz mumkin.`,
});
    }

   return NextResponse.json({
  method: "sendMessage",
  chat_id: chatId,
  text: `❌ Ошибка подключения.
Пожалуйста, обратитесь к администратору учебного центра.

❌ Ulanishda xatolik yuz berdi.
Iltimos, o‘quv markazi ma’muriyatiga murojaat qiling.`,
});
  }

  return NextResponse.json({ ok: true });
}