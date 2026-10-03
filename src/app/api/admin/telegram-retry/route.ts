import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { apiUser, sameOrigin } from "@/lib/auth";
import { retryDeliveries } from "@/lib/telegramDelivery";
export const runtime = "nodejs";
export const maxDuration = 60;
function cronAuth(req: Request) {
  const key = process.env.CRON_SECRET;
  if (!key) return false;
  const token =
    req.headers.get("authorization")?.replace(/^Bearer /, "") ||
    req.headers.get("x-cron-secret") ||
    "";
  return timingSafeEqual(
    createHash("sha256").update(key).digest(),
    createHash("sha256").update(token).digest(),
  );
}
export async function POST(req: Request) {
  if (
    !cronAuth(req) &&
    (!sameOrigin(req) || !(await apiUser(["ADMIN", "DIRECTOR"])))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, results: await retryDeliveries(5) });
}
export async function GET(req: Request) {
  if (!cronAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, results: await retryDeliveries(5) });
}
