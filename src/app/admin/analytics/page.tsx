import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { debtSummary } from "@/lib/dashboard";
import { dateKey, money, monthWindow } from "@/lib/format";
import Link from "next/link";
export default async function Analytics({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireRole("DIRECTOR");
  const { start, end, month } = monthWindow(
    (await searchParams).month || dateKey().slice(0, 7),
  );
  const [revenue, expenses, leads, groups, teachers, year, debt] =
    await Promise.all([
      prisma.payment.aggregate({
        where: {
          periodStart: { gte: start, lt: end },
          status: { in: ["PAID", "PARTIAL"] },
        },
        _sum: { paidAmount: true },
        _count: true,
      }),
      prisma.expense.aggregate({
        where: { date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      prisma.lead.groupBy({
        by: ["status"],
        where: { createdAt: { gte: start, lt: end }, archivedAt: null },
        _count: { _all: true },
      }),
      prisma.$queryRaw<
        { name: string; total: bigint; present: bigint }[]
      >`SELECT g.name,COUNT(*) AS total,COUNT(*) FILTER(WHERE r.attendance='PRESENT') AS present FROM "Report" r JOIN "Group" g ON g.id=r."groupId" WHERE r."dateKey">=${month + "-01"} AND r."dateKey"<${end.toISOString().slice(0, 10)} GROUP BY g.id,g.name ORDER BY g.name`,
      prisma.$queryRaw<
        { name: string; total: bigint; present: bigint; homework: bigint }[]
      >`SELECT u.name,COUNT(*) AS total,COUNT(*) FILTER(WHERE r.attendance='PRESENT') AS present,COUNT(*) FILTER(WHERE r.homework='DONE') AS homework FROM "Report" r JOIN "User" u ON u.id=r."teacherId" WHERE r."dateKey">=${month + "-01"} AND r."dateKey"<${end.toISOString().slice(0, 10)} GROUP BY u.id,u.name ORDER BY u.name`,
      prisma.$queryRaw<
        { month: string; amount: bigint }[]
      >`SELECT to_char("periodStart",'YYYY-MM') AS month,SUM("paidAmount")::bigint AS amount FROM "Payment" WHERE "periodStart">=${new Date(Date.UTC(start.getUTCFullYear(), 0, 1))} AND "periodStart"<${new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1))} AND status IN ('PAID','PARTIAL') GROUP BY month ORDER BY month`,
      debtSummary(month),
    ]);
  const received = revenue._sum.paidAmount || 0;
  const spent = expenses._sum.amount || 0;
  const count = leads.reduce((s, l) => s + l._count._all, 0);
  const converted =
    leads.find((l) => l.status === "CONVERTED")?._count._all || 0;
  const max = Math.max(1, ...year.map((r) => Number(r.amount)));
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">ДИРЕКТОРУ</div>
          <h1>Аналитика центра</h1>
          <p>Учебный период, работа с заявками и посещаемость.</p>
        </div>
        <form className="filters" style={{ margin: 0 }}>
          <input
            name="month"
            type="month"
            defaultValue={month}
            aria-label="Период"
          />
          <button className="btn">Показать</button>
        </form>
      </header>
      <div className="metric-grid">
        {[
          ["Получено за учебный период", money(received)],
          ["Расходы периода", money(spent)],
          ["Разница", money(received - spent)],
          [
            "Конверсия новых лидов",
            count ? Math.round((converted / count) * 100) + "%" : "—",
          ],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span className="metric-label">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginBottom: 24 }}>
        Конверсия: {converted} зачислений из {count} лидов, созданных в
        выбранном месяце. Получено — фактические суммы по начислениям учебного
        периода; это не отчёт движения денег по дате взноса.
      </p>
      <div className="two-col">
        <section className="panel">
          <h2 className="panel-title">
            Получено по учебным месяцам · {start.getUTCFullYear()}
          </h2>
          {Array.from({ length: 12 }, (_, i) => {
            const key = `${start.getUTCFullYear()}-${String(i + 1).padStart(2, "0")}`;
            const amount = Number(
              year.find((y) => y.month === key)?.amount || 0,
            );
            return (
              <div key={key} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12,
                    marginBottom: 5,
                  }}
                >
                  <span>{key}</span>
                  <strong>{money(amount)}</strong>
                </div>
                <div
                  style={{
                    height: 8,
                    background: "var(--soft)",
                    borderRadius: 3,
                  }}
                >
                  <div
                    style={{
                      width: `${(amount / max) * 100}%`,
                      height: "100%",
                      background: "var(--blue)",
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Задолженность</h2>
            <Link href="/admin/payments" className="badge">
              Все оплаты →
            </Link>
          </div>
          <h1>{money(debt.total)}</h1>
          <p className="muted">
            {debt.count} учеников · 12 крупнейших остатков
          </p>
          {debt.rows.slice(0, 12).map((r) => (
            <Link
              className="list-row"
              href={"/admin/students/" + r.studentId}
              key={r.studentId}
            >
              <strong>{r.name}</strong>
              <span className="error-text">{money(r.balance)}</span>
            </Link>
          ))}
        </section>
      </div>
      <section className="panel" style={{ marginTop: 24 }}>
        <h2 className="panel-title">Посещаемость по группам</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Группа</th>
                <th>Отметок</th>
                <th>Присутствовали</th>
                <th>Посещаемость</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => (
                <tr key={i}>
                  <td>{g.name}</td>
                  <td>{Number(g.total)}</td>
                  <td>{Number(g.present)}</td>
                  <td>
                    {Math.round((Number(g.present) / Number(g.total)) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2 className="panel-title">Отчёты преподавателей</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Преподаватель</th>
                <th>Отметок</th>
                <th>Посещаемость</th>
                <th>ДЗ выполнено полностью</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t, i) => (
                <tr key={i}>
                  <td>{t.name}</td>
                  <td>{Number(t.total)}</td>
                  <td>
                    {Math.round((Number(t.present) / Number(t.total)) * 100)}%
                  </td>
                  <td>
                    {Math.round((Number(t.homework) / Number(t.total)) * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
