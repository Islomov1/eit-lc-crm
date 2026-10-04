import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { importSheetLead } from "@/lib/sheet-leads";
export const runtime = "nodejs";
export const maxDuration = 60;
function authorized(req: Request) {
  const secret = process.env.SHEETS_CRM_SECRET;
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  return !!secret && timingSafeEqual(createHash("sha256").update(secret).digest(), createHash("sha256").update(token).digest());
}
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ok: false}, {status: 401});
  return NextResponse.json({ok: !!process.env.EIT_LEADS_SPREADSHEET_ID, integration: "eit-online-sheets"});
}
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ok: false}, {status: 401});
  if (!process.env.EIT_LEADS_SPREADSHEET_ID) return NextResponse.json({ok: false}, {status: 503});
  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ok: false}, {status: 415});
  let body;
  try {
    const reader = req.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 128000) { await reader.cancel(); return NextResponse.json({ok: false}, {status: 413}); }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || body.spreadsheetId !== process.env.EIT_LEADS_SPREADSHEET_ID || !Array.isArray(body.rows) || body.rows.length > 25 || body.rows.length < 1) throw Error();
  } catch { return NextResponse.json({ok: false, error: "Invalid spreadsheet or rows"}, {status: 400}); }
  const results = [];
  for (const row of body.rows) {
    try { results.push(await importSheetLead(body.spreadsheetId, row)); }
    catch (e) {
      results.push({requestId: typeof row?.request_id === "string" ? row.request_id.slice(0, 200) : "", status: "error", message: e instanceof Error ? e.message : "Не удалось перенести строку"});
    }
  }
  // No advertising or parent messaging side effects during imports/retries.
  return NextResponse.json({ok: true, results}, {headers: {"Cache-Control": "no-store"}});
}
