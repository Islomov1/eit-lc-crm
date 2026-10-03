import { apiUser } from "@/lib/auth";
import { ledger } from "@/lib/payments";
import { money } from "@/lib/format";
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
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
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>EIT · Оплаты</title><style>body{font:14px Arial;padding:30px;color:#173662}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #dce3ea;text-align:left}th{background:#eef3f8}h1{font-size:28px}</style></head><body><h1>EIT · Ведомость оплат</h1><p>Период: ${esc(month)}</p><table><thead><tr><th>Ученик</th><th>Группа</th><th>Начислено</th><th>Получено</th><th>Остаток</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.studentName)}</td><td>${esc(r.groupName)} ${r.status === "VOID" ? "(отменено)" : r.status === "REFUND" ? "(возврат)" : ""}</td><td>${money(r.amount)}</td><td>${money(r.paidAmount)}</td><td>${money(r.balance)}</td></tr>`).join("")}</tbody></table><p>Получено: ${money(rows.reduce((s, r) => s + r.paidAmount, 0))} · Остаток: ${money(rows.reduce((s, r) => s + r.balance, 0))}</p></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="eit-payments-${month}.html"`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
