import { NextResponse } from "next/server";
import { cronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { snapshotTodaysLessons } from "@/lib/lessons";
import { queueWeeklyReports } from "@/lib/report-summary";
import { retryDeliveries } from "@/lib/telegramDelivery";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  if (!cronAuth(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const config = await prisma.reportAutomation.findUnique({
    where: { id: "parent-reports" },
  });
  if (new URL(req.url).searchParams.get("dryRun") === "1")
    return NextResponse.json({
      ok: true,
      dryRun: true,
      enabled: config?.enabled || false,
    });
  if (!config?.enabled)
    return NextResponse.json({ ok: true, skipped: "disabled" });
  const deadline = Date.now() + 220000;
  try {
    await prisma.reportAutomation.update({
      where: { id: config.id },
      data: { lastRunAt: new Date() },
    });
    const lessons = await snapshotTodaysLessons();
    const queued = await queueWeeklyReports();
    let processed = 0;
    while (Date.now() < deadline) {
      const rows = await retryDeliveries(25, true);
      processed += rows.length;
      if (rows.length < 25 || rows.every((r) => r.status === "SKIPPED")) break;
    }
    await prisma.reportAutomation.update({
      where: { id: config.id },
      data: { lastSuccessAt: new Date(), lastError: null },
    });
    return NextResponse.json({ ok: true, lessons, queued, processed });
  } catch {
    await prisma.reportAutomation.update({
      where: { id: config.id },
      data: { lastError: "Ошибка ежедневной проверки отчётов" },
    });
    return NextResponse.json(
      { error: "Parent report maintenance failed" },
      { status: 500 },
    );
  }
}
