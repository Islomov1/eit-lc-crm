import { prisma } from "@/src/lib/prisma";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

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

  const supports = await prisma.user.findMany({
    where: { role: "SUPPORT" },
    include: {
      supportSessions: {
        where: {
          startTime: {
            gte: startOfMonth,
            lt: endOfMonth,
          },
        },
      },
    },
  });

  const data = supports.map((support) => {
    const totalHours =
      support.supportSessions.reduce(
        (sum, session) =>
          sum +
          (session.endTime.getTime() -
            session.startTime.getTime()) /
            (1000 * 60 * 60),
        0
      );

    return {
      Name: support.name,
      Email: support.email,
      Sessions: support.supportSessions.length,
      TotalHours: totalHours.toFixed(2),
      Month: `${selectedMonth.getFullYear()}-${selectedMonth.getMonth() + 1}`,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Support");

  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Disposition":
        "attachment; filename=support-report.xlsx",
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}