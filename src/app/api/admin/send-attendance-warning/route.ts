import { apiUser, sameOrigin } from "@/lib/auth";
// src/app/api/admin/send-attendance-warning/route.ts
import { periodSummary } from "@/lib/report-summary";
import { monthWindow } from "@/lib/format";
import { NextResponse } from "next/server";
import { sendTelegramToStudentParents } from "@/lib/telegramDelivery";

export async function POST(request: Request) {
  if (!sameOrigin(request) || !(await apiUser(["ADMIN", "DIRECTOR"])))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  const period = monthWindow(month || "");
  const rows = await periodSummary(
    period.month + "-01",
    period.end.toISOString().slice(0, 10),
  );
  const monthKey = period.month;
  for (const row of rows) {
    // Never warn based on incomplete or unreconstructable lesson rosters.
    if (!row.marked || row.missing || row.legacy) continue;
    const student = { id: row.studentId, name: row.studentName };
    const percent = (row.present / row.marked) * 100;
    if (percent < 70) {
      const message = `
Уважаемые родители!

Посещаемость ученика ${student.name} в группе ${row.groupName} за ${monthKey} составляет ${percent.toFixed(1)}%.

Просим обратить внимание на регулярность посещения занятий.

—

Hurmatli ota-onalar!

${student.name} o‘quvchisining ${row.groupName} guruhida ${monthKey} oy uchun davomat ko‘rsatkichi ${percent.toFixed(1)}% ni tashkil etadi.

Iltimos, darslarga muntazam qatnashishini nazorat qiling.
`.trim();

      // ✅ centralized delivery + dedupe per student+month
      await sendTelegramToStudentParents(
        student.id,
        message,
        { type: "SYSTEM" },
        {
          sourceType: "ATTENDANCE_WARNING",
          sourceId: monthKey,
          idempotencyKey: `ATTENDANCE_WARNING:${student.id}:${row.groupId}:${monthKey}`,
        },
      );
    }
  }

  return NextResponse.json({ success: true });
}
