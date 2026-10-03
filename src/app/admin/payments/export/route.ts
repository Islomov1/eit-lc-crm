import { apiUser } from "@/lib/auth";
import { ledger } from "@/lib/payments";
import ExcelJS from "exceljs";
export async function GET(req: Request) {
  if (!(await apiUser(["ADMIN", "DIRECTOR"])))
    return new Response("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const { rows, month } = await ledger({
    month: sp.get("month") || "",
    teacherId: sp.get("teacherId") || "",
    q: sp.get("q") || "",
    all: true,
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Оплаты", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "Ученик", key: "studentName", width: 32 },
    { header: "Группа", key: "groupName", width: 25 },
    { header: "Преподаватель", key: "teacherName", width: 28 },
    { header: "Начислено", key: "amount", width: 18 },
    { header: "Получено", key: "paidAmount", width: 18 },
    { header: "Остаток", key: "balance", width: 18 },
    { header: "Статус", key: "status", width: 18 },
    { header: "Комментарий", key: "note", width: 40 },
  ];
  for (const r of rows)
    ws.addRow({
      ...r,
      status:
        r.status === "VOID"
          ? "Отменено"
          : r.status === "REFUND"
            ? "Возврат"
            : r.balance > 0
              ? "Не полностью"
              : "Оплачено",
    });
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF173662" },
  };
  for (const key of ["amount", "paidAmount", "balance"])
    ws.getColumn(key).numFmt = "#,##0";
  ws.addRow({
    studentName: "ИТОГО",
    amount: rows
      .filter((r) => !["VOID", "REFUND"].includes(r.status))
      .reduce((s, r) => s + r.amount, 0),
    paidAmount: rows.reduce((s, r) => s + r.paidAmount, 0),
    balance: rows.reduce((s, r) => s + r.balance, 0),
  }).font = { bold: true };
  return new Response(Buffer.from(await wb.xlsx.writeBuffer()), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="eit-payments-${month}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
