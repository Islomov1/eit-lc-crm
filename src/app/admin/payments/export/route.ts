import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import { PaymentStatus, Role } from "@prisma/client";

function monthWindowFromYYYYMM(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) throw new Error("Invalid month format. Use YYYY-MM");
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0, 0);
  return { start, end };
}

function safeSheetName(name: string) {
  // Excel sheet name rules: max 31, no: : \ / ? * [ ]
  return name
    .replace(/[:\\/?*\[\]]/g, " ")
    .trim()
    .slice(0, 31) || "Sheet";
}

function yyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const month = searchParams.get("month") || "";
  const teacherId = searchParams.get("teacherId") || ""; // optional

  if (!month) return new Response("month is required (YYYY-MM)", { status: 400 });

  const { start } = monthWindowFromYYYYMM(month);

  // Teachers to export
  const teachers = await prisma.user.findMany({
    where: {
      role: Role.TEACHER,
      ...(teacherId ? { id: teacherId } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (teachers.length === 0) return new Response("No teachers found for export", { status: 404 });

  const teacherIds = teachers.map((t) => t.id);

  // Students for those teachers (via group.teacherId)
  const students = await prisma.student.findMany({
    where: { group: { teacherId: { in: teacherIds } } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      group: { select: { name: true, teacherId: true } },
    },
  });

  // Payments for month + those teachers
  const payments = await prisma.payment.findMany({
    where: {
      periodStart: start,
      teacherId: { in: teacherIds },
      status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIAL, PaymentStatus.REFUND, PaymentStatus.VOID] },
    },
    select: {
      id: true,
      teacherId: true,
      studentId: true,
      amount: true,
      status: true,
      method: true,
      paidAt: true,
    },
  });

  // Build maps
  const paymentsByTeacher = new Map<string, Map<string, typeof payments[number]>>();
  for (const tId of teacherIds) paymentsByTeacher.set(tId, new Map());
  for (const p of payments) {
    if (!p.teacherId) continue;
    paymentsByTeacher.get(p.teacherId)?.set(p.studentId, p);
  }

  const studentsByTeacher = new Map<string, typeof students>();
  for (const tId of teacherIds) studentsByTeacher.set(tId, []);
  for (const s of students) {
    const tId = s.group?.teacherId;
    if (!tId) continue;
    if (!studentsByTeacher.has(tId)) studentsByTeacher.set(tId, []);
    studentsByTeacher.get(tId)!.push(s);
  }

  // Workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = "CRM";
  wb.created = new Date();

  // Summary sheet
  const summary = wb.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  summary.columns = [
    { header: "Teacher", key: "teacher", width: 28 },
    { header: "Month", key: "month", width: 10 },
    { header: "Total collected", key: "total", width: 16 },
    { header: "Teacher 40%", key: "t40", width: 14 },
    { header: "Center 60%", key: "c60", width: 14 },
    { header: "Payments", key: "count", width: 10 },
  ];

  summary.getRow(1).font = { bold: true };
  summary.getRow(1).alignment = { vertical: "middle" };

  // One sheet per teacher
  for (const t of teachers) {
    const sheetName = safeSheetName(t.name);
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.columns = [
      { header: "#", key: "idx", width: 5 },
      { header: "Student", key: "student", width: 28 },
      { header: "Group", key: "group", width: 20 },
      { header: "Paid", key: "paid", width: 10 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Status", key: "status", width: 12 },
      { header: "Method", key: "method", width: 12 },
      { header: "Paid date", key: "paidAt", width: 12 },
    ];

    // Header styling
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FF374151" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 18;

    const tStudents = studentsByTeacher.get(t.id) ?? [];
    const tPayMap = paymentsByTeacher.get(t.id) ?? new Map();

    let totalCollected = 0;
    let paymentCount = 0;

    tStudents.forEach((s, i) => {
      const p = tPayMap.get(s.id);

      const isPaid =
        !!p && (p.status === PaymentStatus.PAID || p.status === PaymentStatus.PARTIAL);

      const amount = p?.amount ?? 0;
      const status = p?.status ?? "";
      const method = p?.method ?? "";
      const paidAt = p?.paidAt ? yyyyMmDd(new Date(p.paidAt)) : "";

      // Count totals only for PAID / PARTIAL
      if (p && (p.status === PaymentStatus.PAID || p.status === PaymentStatus.PARTIAL)) {
        totalCollected += amount;
        paymentCount += 1;
      }

      ws.addRow({
        idx: i + 1,
        student: s.name,
        group: s.group?.name ?? "-",
        paid: isPaid ? "PAID" : "NOT PAID",
        amount: amount || "",
        status,
        method,
        paidAt,
      });
    });

    // Amount formatting
    ws.getColumn("amount").numFmt = "#,##0";

    // Conditional formatting for Paid column (green/red)
    // Column D is Paid
    if (tStudents.length > 0) {
      const fromRow = 2;
      const toRow = tStudents.length + 1;
    ws.addConditionalFormatting({
  ref: `D${fromRow}:D${toRow}`,
  rules: [
    {
      type: "expression",
      priority: 1,
      formulae: [`$D${fromRow}="PAID"`],
      style: {
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD1FAE5" }, // green
        },
        font: {
          color: { argb: "FF065F46" },
          bold: true,
        },
      },
    },
    {
      type: "expression",
      priority: 2,
      formulae: [`$D${fromRow}="NOT PAID"`],
      style: {
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEE2E2" }, // red
        },
        font: {
          color: { argb: "FF991B1B" },
          bold: true,
        },
      },
    },
  ],
});
    }

    // Total row at bottom (auto)
    const lastDataRow = Math.max(1, tStudents.length + 1);
    const totalRowIndex = lastDataRow + 1;

    ws.getCell(`A${totalRowIndex}`).value = "TOTAL";
    ws.getCell(`A${totalRowIndex}`).font = { bold: true };
    ws.mergeCells(`A${totalRowIndex}:D${totalRowIndex}`);

    // SUM amounts column E
    ws.getCell(`E${totalRowIndex}`).value = {
      formula: `SUM(E2:E${lastDataRow})`,
    };
    ws.getCell(`E${totalRowIndex}`).numFmt = "#,##0";
    ws.getCell(`E${totalRowIndex}`).font = { bold: true };

    // Subtle total row fill
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getRow(totalRowIndex).getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    }

    // Add to summary
    const teacher40 = Math.round(totalCollected * 0.4);
    const center60 = totalCollected - teacher40;

    summary.addRow({
      teacher: t.name,
      month,
      total: totalCollected,
      t40: teacher40,
      c60: center60,
      count: paymentCount,
    });
  }

  // Summary styling + formats
  summary.getColumn("total").numFmt = "#,##0";
  summary.getColumn("t40").numFmt = "#,##0";
  summary.getColumn("c60").numFmt = "#,##0";

  // Summary totals row
  const sumLast = summary.rowCount;
  const sumTotalRow = summary.addRow({
    teacher: "TOTAL",
    month,
    total: { formula: `SUM(C2:C${sumLast})` },
    t40: { formula: `SUM(D2:D${sumLast})` },
    c60: { formula: `SUM(E2:E${sumLast})` },
    count: { formula: `SUM(F2:F${sumLast})` },
  });

  sumTotalRow.font = { bold: true };
  sumTotalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };

  // Generate buffer
  const buffer = await wb.xlsx.writeBuffer();

  const filename = teacherId
    ? `payments-${month}-${safeSheetName(teachers[0].name)}.xlsx`
    : `payments-${month}-ALL-TEACHERS.xlsx`;

  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}