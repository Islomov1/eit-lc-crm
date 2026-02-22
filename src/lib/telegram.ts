// src/lib/telegram.ts

export type TelegramParseMode = "HTML" | "MarkdownV2";

export type TelegramSendResult =
  | { ok: true; messageId: number }
  | { ok: false; error: string; payload?: unknown; httpStatus?: number };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function sendTelegramMessage(
  chatId: string | bigint,
  text: string,
  opts?: { parseMode?: TelegramParseMode }
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: typeof chatId === "bigint" ? chatId.toString() : chatId,
        text,
        parse_mode: opts?.parseMode,
        disable_web_page_preview: true,
      }),
    });

    const json: unknown = await res.json();

    // Telegram responses are { ok: boolean, result?: {...}, description?: string }
    const ok = isObject(json) && json["ok"] === true;
    if (!res.ok || !ok) {
      const description =
        isObject(json) && typeof json["description"] === "string"
          ? json["description"]
          : `HTTP ${res.status}`;

      return {
        ok: false,
        error: description,
        payload: json,
        httpStatus: res.status,
      };
    }

    const result = isObject(json) ? json["result"] : null;
    const messageIdRaw = isObject(result) ? result["message_id"] : null;

    // Telegram message_id is a number in JSON
    const messageId =
      typeof messageIdRaw === "number"
        ? messageIdRaw
        : typeof messageIdRaw === "string"
          ? Number(messageIdRaw)
          : NaN;

    if (!Number.isFinite(messageId)) {
      return { ok: false, error: "Telegram response missing message_id", payload: json };
    }

    return { ok: true, messageId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Telegram fetch failed";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}
