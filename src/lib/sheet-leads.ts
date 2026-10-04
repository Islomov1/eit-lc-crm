import { createHash } from "node:crypto";
import { prisma } from "./prisma";

const courses: Record<string, string> = {
  general: "General English", cefr: "CEFR", ielts: "IELTS",
  "sat-english": "SAT English", "sat-math": "SAT Math", "sat-bundle": "SAT",
  individual: "Индивидуальные занятия", advice: "Консультация",
};
const schedules: Record<string, string> = {
  morning: "Утро", afternoon: "День", evening: "Вечер", flexible: "Гибкое расписание",
};
function field(row: Record<string, unknown>, key: string, max = 500) {
  const value = row[key];
  if (value == null) return "";
  if (typeof value !== "string" && typeof value !== "number") throw Error("Некорректное поле: " + key);
  // Some old cells contain the literal spreadsheet formula-escape prefix.
  return String(value).trim().replace(/^'(?=[=+\-@])/, "").slice(0, max);
}
export function sheetLeadId(spreadsheetId: string, requestId: string) {
  const h = createHash("sha256").update(`google-sheets:${spreadsheetId}:${requestId}`).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-8${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function normalizeSheetLead(spreadsheetId: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Некорректная строка");
  const row = value as Record<string, unknown>;
  const requestId = field(row, "request_id", 200);
  if (!/^[-a-zA-Z0-9]{16,80}$/.test(requestId)) throw Error("Нужен уникальный request_id (16–80 символов)");
  const name = field(row, "name", 255), origin = field(row, "source", 500);
  if (/^eit-(test|local-verify|docker-check|crm-check)-/i.test(requestId) ||
      /(^|[|\s])(integration-test|local-verify|docker-smoke|do-not-call)([|\s]|$)/i.test(origin) ||
      /^(тест(?:\s|$|[—:-])|test\b|EIT Local Verify\b|Local Check\b|<test lead:)/iu.test(name)) {
    return { requestId, skipped: true as const, reason: "Тестовая заявка — не клиент" };
  }
  if (name.length < 2) throw Error("Не указано имя");
  if (!["yes", "true", "on", "да"].includes(field(row, "consent").toLowerCase())) throw Error("Нет согласия на обработку заявки");
  const rawPhone = field(row, "phone", 50);
  if (!/^\+?[\d\s()-]+$/.test(rawPhone)) throw Error("Проверьте телефон");
  let digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 9) digits = "998" + digits;
  if (digits.length < 7 || digits.length > 15 || /^(\d)\1+$/.test(digits)) throw Error("Проверьте телефон");
  const timestamp = field(row, "created_at", 50);
  const createdAt = new Date(timestamp);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(createdAt.getTime()) || createdAt > new Date(Date.now() + 300000)) throw Error("Проверьте дату created_at (ISO с часовым поясом)");
  const course = field(row, "course", 100), schedule = field(row, "schedule", 200);
  const lines = [
    "Google Sheets · EIT Online",
    `Заявка: ${requestId}`,
    `Исходная дата: ${timestamp}`,
    `Форма / результат теста: ${origin || "не указан"}`,
    `Расписание: ${schedules[schedule] || schedule || "не указано"}`,
    `Язык формы: ${field(row, "locale", 20) || "не указан"}`,
    "Согласие на обработку: да",
  ];
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = field(row, key, 200); if (v) lines.push(`${key}: ${v}`);
  }
  lines.push(`Таблица: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
  return { requestId, skipped: false as const, data: {
    id: sheetLeadId(spreadsheetId, requestId), name, phone: "+" + digits,
    program: courses[course] || course || null, learningFormat: "ONLINE" as const,
    source: /^placement(?:\s|\|)/i.test(origin) ? "placement" : "website",
    note: lines.join("\n"), createdAt, status: "NEW" as const,
  }};
}

export async function importSheetLead(spreadsheetId: string, row: unknown) {
  const normalized = normalizeSheetLead(spreadsheetId, row);
  if (normalized.skipped) return { requestId: normalized.requestId, status: "skipped", message: normalized.reason };
  try {
    await prisma.$transaction(async tx => {
      await tx.lead.create({data: normalized.data});
      await tx.leadActivity.create({data: {leadId: normalized.data.id, actorName: "Google Sheets", text: "Заявка перенесена из EIT Online. Исходная дата сохранена."}});
      await tx.auditLog.create({data: {actorName: "Google Sheets", action: "IMPORT", entity: "Lead", entityId: normalized.data.id, summary: "Импорт заявки EIT Online по уникальному request_id."}});
    });
    return { requestId: normalized.requestId, status: "imported", leadId: normalized.data.id };
  } catch (err) {
    if (typeof err === "object" && err && "code" in err && err.code === "P2002") {
      const existing = await prisma.lead.findUnique({where: {id: normalized.data.id}, select: {id: true}});
      if (existing) return {requestId: normalized.requestId, status: "existing", leadId: existing.id};
    }
    throw Error("CRM временно недоступна. Повторите синхронизацию.");
  }
}
