import crypto from "crypto";
import { prisma } from "./prisma";

const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// Приводим телефон к единому формату и хэшируем — так требует Meta
function hashPhone(phone: string): string {
  // Убираем всё кроме цифр (пробелы, +, скобки, тире)
  const digitsOnly = phone.replace(/\D/g, "");
  return crypto.createHash("sha256").update(digitsOnly).digest("hex");
}

type LeadEventType = "Lead" | "Trial" | "Enrolled";

interface SendLeadEventParams {
  event: LeadEventType;
  leadId: string;
  phone: string | null;
  source?: string | null;
  program?: string | null;
}

export async function sendLeadEvent(params: SendLeadEventParams) {
  // Если вебхук ещё не настроен — просто выходим, ничего не ломаем
  if (!MAKE_WEBHOOK_URL) {
    console.warn("MAKE_WEBHOOK_URL не задан, событие не отправлено");
    return;
  }

  // Без телефона Meta не сможет матчить лида — пропускаем
  if (!params.phone) {
    console.warn(
      `Lead ${params.leadId}: нет телефона, событие ${params.event} не отправлено`,
    );
    return;
  }

  const payload = {
    event: params.event,
    eventId: `${params.event}:${params.leadId}`,
    leadId: params.leadId,
    phoneHash: hashPhone(params.phone),
    source: params.source || null,
    program: params.program || null,
    timestamp: Math.floor(Date.now() / 1000),
  };

  try {
    const result = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
  } catch {
    await prisma.integrationError
      .create({
        data: {
          service: "Make",
          message: `Не доставлено событие ${params.event} для лида ${params.leadId}. Проверьте сценарий Make.`,
        },
      })
      .catch(() => {});
  }
}

// Маппинг статуса лида в CRM → событие для Meta
export function statusToEvent(status: string): LeadEventType | null {
  switch (status) {
    case "NEW":
      return "Lead";
    case "ACTIVE":
      return "Trial";
    case "CONVERTED":
      return "Enrolled";
    default:
      return null; // FROZEN, LOST — не отправляем
  }
}
