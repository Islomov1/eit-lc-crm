import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Секретный токен для защиты webhook
// Добавь в .env: WEBHOOK_SECRET=какой_угодно_длинный_токен
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  try {
    // ── Проверка секрета ──────────────────────────────────
    const authHeader = req.headers.get("authorization");
    const tokenFromQuery = req.nextUrl.searchParams.get("secret");

    const token = authHeader?.replace("Bearer ", "") || tokenFromQuery;

    if (WEBHOOK_SECRET && token !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Читаем тело запроса ───────────────────────────────
    const body = await req.json();

    // Поддерживаем разные форматы от разных сервисов:
    // smmbot, ManyChat, Zapier — у всех разная структура
    const name =
      body.name ||
      body.full_name ||
      body.first_name ||
      body.contact_name ||
      body.subscriber_name ||
      "Unknown";

    const phone =
      body.phone ||
      body.phone_number ||
      body.contact_phone ||
      body.subscriber_phone ||
      null;

    const source =
      body.source ||
      body.platform ||
      body.channel ||
      body.utm_source ||
      "webhook";

    const program =
      body.program ||
      body.course ||
      body.interest ||
      body.tag ||
      null;

    const note =
      body.note ||
      body.message ||
      body.comment ||
      body.last_message ||
      null;

    // ── Создаём лида ──────────────────────────────────────
    const lead = await prisma.lead.create({
      data: {
        name: String(name).trim().slice(0, 255),
        phone: phone ? String(phone).trim().slice(0, 50) : null,
        source: source ? String(source).trim().slice(0, 100) : "webhook",
        program: program ? String(program).trim().slice(0, 100) : null,
        note: note ? String(note).trim().slice(0, 1000) : null,
        status: "NEW",
      },
    });

    return NextResponse.json({
      ok: true,
      lead: { id: lead.id, name: lead.name, status: lead.status },
    });

  } catch (err) {
    console.error("WEBHOOK_ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Для проверки что webhook живой (GET запрос)
export async function GET(req: NextRequest) {
  const tokenFromQuery = req.nextUrl.searchParams.get("secret");
  if (WEBHOOK_SECRET && tokenFromQuery !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, message: "EIT LC Leads Webhook is alive 🚀" });
}