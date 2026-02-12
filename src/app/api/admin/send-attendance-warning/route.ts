import { prisma } from "@/src/lib/prisma";
import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/src/lib/telegram";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  const selectedMonth = month
    ? new Date(month)
    : new Date();

  const startOfMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth(),
    1
  );

  const endOfMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
    1
  );

  const students = await prisma.student.findMany({
    include: {
      parents: true,
      reports: {
        where: {
          date: {
            gte: startOfMonth,
            lt: endOfMonth,
          },
        },
      },
    },
  });

  for (const student of students) {
    const total = student.reports.length;
    const present = student.reports.filter(
      (r) => r.attendance === "PRESENT"
    ).length;

    if (total === 0) continue;

    const percent = (present / total) * 100;

    if (percent < 70) {
      const message = `
Уважаемые родители!

Посещаемость ученика ${student.name} за выбранный месяц составляет ${percent.toFixed(
        1
      )}%.

Просим обратить внимание на регулярность посещения занятий.

—

Hurmatli ota-onalar!

${student.name} o‘quvchisining tanlangan oy uchun davomat ko‘rsatkichi ${percent.toFixed(
        1
      )}% ni tashkil etadi.

Iltimos, darslarga muntazam qatnashishini nazorat qiling.
`;

      for (const parent of student.parents) {
        if (parent.telegramId) {
          await sendTelegramMessage(
            parent.telegramId,
            message
          );
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
  });
}