// src/lib/telegram.ts
type InlineButton = {
  text: string;
  callback_data: string;
};

type ReplyKeyboardButton = {
  text: string;
  request_contact?: boolean;
};

async function telegramApi(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing");
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;

  if (!res.ok || !data?.ok) {
    throw new Error(
      `Telegram API ${method} failed: ${res.status} ${data?.description ?? "Unknown error"}`
    );
  }

  return data;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
  });
}

export async function sendTelegramMessageWithInlineKeyboard(
  chatId: string,
  text: string,
  rows: InlineButton[][]
) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      inline_keyboard: rows,
    },
  });
}

export async function sendTelegramContactRequestKeyboard(chatId: string, text: string) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      keyboard: [
        [
          {
            text: "📱 Отправить номер / Raqamni yuborish",
            request_contact: true,
          } satisfies ReplyKeyboardButton,
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

export async function removeTelegramReplyKeyboard(chatId: string, text: string) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: {
      remove_keyboard: true,
    },
  });
}

export async function answerTelegramCallbackQuery(callbackQueryId: string, text?: string) {
  return telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}