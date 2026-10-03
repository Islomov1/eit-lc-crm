import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateKey, monthWindow } from "@/lib/format";
import Link from "next/link";
export default async function SupportReport({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireRole("ADMIN", "DIRECTOR");
  const { month, start, end } = monthWindow(
    (await searchParams).month || dateKey().slice(0, 7),
  );
  const rows = await prisma.$queryRaw<
    { id: string; name: string; sessions: bigint; minutes: number }[]
  >`SELECT u.id,u.name,COUNT(s.id) AS sessions,COALESCE(SUM(EXTRACT(EPOCH FROM (s."endTime"-s."startTime"))/60),0)::float AS minutes FROM "User" u LEFT JOIN "SupportSession" s ON s."supportId"=u.id AND s."startTime">=${start} AND s."startTime"<${end} WHERE u.role='SUPPORT' GROUP BY u.id,u.name ORDER BY u.name`;
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">ОБУЧЕНИЕ</div>
          <h1>Академическая поддержка</h1>
          <p>Занятия и время работы сотрудников за месяц.</p>
        </div>
        <Link
          className="btn secondary"
          href={"/admin/support-export?month=" + month}
        >
          Скачать Excel
        </Link>
      </header>
      <form className="filters">
        <input
          name="month"
          type="month"
          defaultValue={month}
          aria-label="Месяц"
        />
        <button className="btn">Показать</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Сотрудник</th>
              <th>Занятия</th>
              <th>Всего часов</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{Number(r.sessions)}</td>
                <td>{(r.minutes / 60).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
