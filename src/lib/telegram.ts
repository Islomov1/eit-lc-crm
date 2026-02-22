// src/lib/telegram.ts

export type TelegramParseMode = "HTML" | "MarkdownV2";

export type TelegramSendResult =
  | { ok: true; messageId?: number; raw?: unknown; payload?: unknown }
  | { ok: false; error: string; raw?: unknown; payload?: unknown };

type TelegramChatId = string | bigint;

type InlineButton = {
  text: string;
  callback_data: string;
};

type ReplyKeyboardButton = {
  text: string;
  request_contact?: boolean;
};

type TelegramApiSuccess = {
  ok: true;
  result?: {
    message_id?: number;
  };
};

type TelegramApiError = {
  ok: false;
  description?: string;
};

function toTelegramChatId(chatId: TelegramChatId): string {
  return typeof chatId === "bigint" ? chatId.toString() : chatId;
}

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
    | TelegramApiSuccess
    | TelegramApiError
    | null;

  if (!res.ok || !data?.ok) {
    const description =
      data && "description" in data ? data.description : undefined;

    throw new Error(
      `Telegram API ${method} failed: ${res.status} ${description ?? "Unknown error"}`
    );
  }

  return data;
}

/**
 * Совместимая функция для retry/delivery route.
 * НЕ бросает исключение, возвращает объект результата.
 */
export async function sendTelegramMessage(
  chatId: TelegramChatId,
  text: string,
  options?: { parseMode?: TelegramParseMode }
): Promise<TelegramSendResult> {
  try {
    const data = await telegramApi("sendMessage", {
      chat_id: toTelegramChatId(chatId),
      text,
      ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
    });

    return {
      ok: true,
      messageId: data.result?.message_id,
      raw: data,
      payload: data, // совместимость со старым кодом
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown Telegram send error";

    return {
      ok: false,
      error: message,
      raw: err,
      payload: err, // совместимость со старым кодом
    };
  }
}

/**
 * Строгая версия для webhook-интерактивных flow.
 * Бросает исключение при ошибке.
 */
export async function sendTelegramMessageStrict(
  chatId: TelegramChatId,
  text: string,
  options?: { parseMode?: TelegramParseMode }
) {
  return telegramApi("sendMessage", {
    chat_id: toTelegramChatId(chatId),
    text,
    ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
  });
}

export async function sendTelegramMessageWithInlineKeyboard(
  chatId: TelegramChatId,
  text: string,
  rows: InlineButton[][]
) {
  return telegramApi("sendMessage", {
    chat_id: toTelegramChatId(chatId),
    text,
    reply_markup: {
      inline_keyboard: rows,
    },
  });
}

export async function sendTelegramContactRequestKeyboard(
  chatId: TelegramChatId,
  text: string
) {
  return telegramApi("sendMessage", {
    chat_id: toTelegramChatId(chatId),
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

export async function removeTelegramReplyKeyboard(
  chatId: TelegramChatId,
  text: string
) {
  return telegramApi("sendMessage", {
    chat_id: toTelegramChatId(chatId),
    text,
    reply_markup: {
      remove_keyboard: true,
    },
  });
}

export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text?: string
) {
  return telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    show_alert: false,
  });
}