import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateKey, monthWindow, pageNumber } from "@/lib/format";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import WarningForm from "@/components/WarningForm";
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; page?: string }>;
}) {
  await requireRole("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const { month, end } = monthWindow(sp.month || dateKey().slice(0, 7));
  const startKey = month + "-01";
  const endKey = end.toISOString().slice(0, 10);
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<
      {
        id: string;
        name: string;
        groupName: string;
        groupId: string;
        total: bigint;
        present: bigint;
        homework: bigint;
      }[]
    >`SELECT s.id,s.name,g.id AS "groupId",g.name AS "groupName",COUNT(*) AS total,COUNT(*) FILTER(WHERE r.attendance='PRESENT') AS present,COUNT(*) FILTER(WHERE r.homework='DONE') AS homework FROM "Report" r JOIN "Student" s ON s.id=r."studentId" JOIN "Group" g ON g.id=r."groupId" WHERE r."dateKey">=${startKey} AND r."dateKey"<${endKey} GROUP BY s.id,s.name,g.id,g.name ORDER BY s.name,g.name LIMIT 30 OFFSET ${(page - 1) * 30}`,
    prisma.$queryRaw<
      { total: bigint }[]
    >`SELECT COUNT(*) AS total FROM (SELECT DISTINCT "studentId","groupId" FROM "Report" WHERE "dateKey">=${startKey} AND "dateKey"<${endKey}) x`,
  ]);
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">УЧЕБНЫЙ ПРОЦЕСС</div>
          <h1>Посещаемость</h1>
          <p>Отметки по каждому ученику и группе за выбранный месяц.</p>
        </div>
        <form className="filters">
          <input
            type="month"
            name="month"
            defaultValue={month}
            aria-label="Месяц"
          />
          <button className="btn">Показать</button>
        </form>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ученик</th>
              <th>Группа</th>
              <th>Занятий отмечено</th>
              <th>Присутствовал</th>
              <th>Посещаемость</th>
              <th>ДЗ выполнено</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id + ":" + r.groupId}>
                <td>
                  <Link href={"/admin/students/" + r.id}>
                    <strong>{r.name}</strong>
                  </Link>
                </td>
                <td>{r.groupName}</td>
                <td>{Number(r.total)}</td>
                <td>{Number(r.present)}</td>
                <td>
                  <span
                    className={
                      "badge " +
                      (Number(r.present) / Number(r.total) >= 0.7
                        ? "green"
                        : "red")
                    }
                  >
                    {Math.round((Number(r.present) / Number(r.total)) * 100)}%
                  </span>
                </td>
                <td>{Number(r.homework)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="empty">За этот месяц отметок пока нет</p>
        )}
      </div>
      <Pagination
        page={page}
        total={Number(count[0].total)}
        base="/admin/attendance"
        params={{ month }}
      />
      <details className="panel" style={{ marginTop: 24 }}>
        <summary className="details-summary">
          <h2>Предупреждения о низкой посещаемости</h2>
        </summary>
        <WarningForm month={month} />
      </details>
    </>
  );
}
