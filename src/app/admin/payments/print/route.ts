import { NextRequest } from "next/server";
import { PaymentStatus } from "@prisma/client";

// CHANGE THIS LINE if needed:
import { prisma } from "@/lib/prisma";

function monthWindowFromYYYYMM(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) throw new Error("Invalid month format. Use YYYY-MM");
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0, 0);
  return { start, end };
}

function fmt(d: Date | null) {
  if (!d) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(req: NextRequest) {
  const teacherId = req.nextUrl.searchParams.get("teacherId") || "";
  const month = req.nextUrl.searchParams.get("month") || "";

  if (!teacherId || !month) {
    return new Response("teacherId and month are required", { status: 400 });
  }

  const { start } = monthWindowFromYYYYMM(month);

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { name: true },
  });

  const students = await prisma.student.findMany({
    where: { group: { teacherId } },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, group: { select: { name: true } } },
  });

  const payments = await prisma.payment.findMany({
    where: { teacherId, periodStart: start },
    select: { studentId: true, amount: true, status: true, paidAt: true },
  });

  const payMap = new Map(payments.map((p) => [p.studentId, p]));

  const rows = students.map((s, idx) => {
    const p = payMap.get(s.id);
    const paid = !!p && (p.status === PaymentStatus.PAID || p.status === PaymentStatus.PARTIAL);
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${s.name}</td>
        <td>${s.group?.name ?? "-"}</td>
        <td>${paid ? "YES" : "NO"}</td>
        <td style="text-align:right">${p?.amount?.toLocaleString?.() ?? ""}</td>
        <td>${p?.status ?? ""}</td>
        <td>${fmt(p?.paidAt ?? null)}</td>
      </tr>
    `;
  });

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payments Sheet</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; }
    h1,h2 { margin: 0 0 8px 0; }
    .meta { margin-bottom: 16px; color: #333; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #333; padding: 8px; font-size: 13px; }
    th { background: #f3f3f3; }
    @media print { button { display:none; } }
  </style>
</head>
<body>
  <h1>Payments Sheet</h1>
  <div class="meta">
    <div><b>Teacher:</b> ${teacher?.name ?? "Unknown"}</div>
    <div><b>Month:</b> ${month}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Student</th>
        <th>Group</th>
        <th>Paid?</th>
        <th>Amount</th>
        <th>Status</th>
        <th>Paid date</th>
      </tr>
    </thead>
    <tbody>
      ${rows.join("")}
    </tbody>
  </table>
</body>
</html>`;

  const filename = `payments-${month}-${teacher?.name ?? "teacher"}.html`.replace(/\s+/g, "_");

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}