import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendLeadEvent } from "@/lib/meta-events";
import { createHash, timingSafeEqual } from "node:crypto";
import { LearningFormat } from "@prisma/client";

function authorize(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 503 },
    );
  }
  const token =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  const expected = createHash("sha256").update(secret).digest();
  const received = createHash("sha256").update(token).digest();
  if (!timingSafeEqual(expected, received)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

function textField(
  body: Record<string, unknown>,
  keys: string[],
  limit: number,
) {
  for (const key of keys) {
    if (body[key] == null || body[key] === "") continue;
    if (typeof body[key] !== "string") throw new Error(`Invalid ${key}`);
    const value = body[key].trim();
    if (value) return value.slice(0, limit);
  }
  return null;
}

// Use the existing primary key to make retries atomic without a database migration.
function metaLeadKey(metaLeadId: string) {
  const hash = createHash("sha256")
    .update(`meta-lead:${metaLeadId}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function POST(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  let data;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Expected a JSON object");
    }
    const name = textField(
      body,
      ["name", "full_name", "first_name", "contact_name", "subscriber_name"],
      255,
    );
    if (!name) throw new Error("Name is required");
    if (
      body.metaLeadId != null &&
      (typeof body.metaLeadId !== "string" ||
        !/^\d{5,50}$/.test(body.metaLeadId))
    ) {
      throw new Error("Invalid metaLeadId");
    }
    if (body.dryRun != null && typeof body.dryRun !== "boolean") {
      throw new Error("dryRun must be a boolean");
    }
    if (body.learningFormat != null && !Object.values(LearningFormat).includes(body.learningFormat as LearningFormat)) throw new Error("Invalid learningFormat");
    data = {
      ...(body.metaLeadId
        ? { id: metaLeadKey(body.metaLeadId as string) }
        : {}),
      name,
      phone: textField(
        body,
        ["phone", "phone_number", "contact_phone", "subscriber_phone"],
        50,
      ),
      source:
        textField(body, ["source", "platform", "channel", "utm_source"], 100) ||
        "webhook",
      program: textField(body, ["program", "course", "interest", "tag"], 100),
      learningFormat: (body.learningFormat || "UNKNOWN") as LearningFormat,
      note: textField(
        body,
        ["note", "message", "comment", "last_message"],
        1000,
      ),
      status: "NEW" as const,
    };
  } catch {
    return NextResponse.json(
      { error: "Invalid lead payload: provide a name and valid text fields" },
      { status: 400 },
    );
  }

  if (body.dryRun === true) {
    return NextResponse.json({ ok: true, dryRun: true });
  }

  try {
    const formId =
      typeof body.formId === "string"
        ? body.formId
        : data.note?.match(/Form ID:\s*(\d{5,50})/)?.[1];
    if (formId) {
      const mapping = await prisma.leadForm.findUnique({
        where: { id: formId },
      });
      if (mapping) {
        if (!data.program) data.program = mapping.program;
        if (data.learningFormat === "UNKNOWN") data.learningFormat = mapping.learningFormat || "UNKNOWN";
      }
    }
    const lead = await prisma.lead.create({ data });

    // Отправляем событие "Lead" в Meta через Make
    after(() =>
      sendLeadEvent({
        event: "Lead",
        leadId: lead.id,
        phone: lead.phone,
        source: lead.source,
        program: lead.program,
      }),
    );

    return NextResponse.json({
      ok: true,
      lead: { id: lead.id, name: lead.name, status: lead.status },
    });
  } catch (err) {
    if (
      data.id &&
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "P2002"
    ) {
      try {
        const lead = await prisma.lead.findUnique({
          where: { id: data.id },
          select: { id: true, name: true, status: true },
        });
        if (lead) return NextResponse.json({ ok: true, duplicate: true, lead });
      } catch {
        // Return a retryable error if the existing row cannot be read.
      }
    }
    console.error("WEBHOOK_ERROR: lead could not be saved");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  return NextResponse.json({
    ok: true,
    message: "EIT LC Leads Webhook is alive 🚀",
  });
}
