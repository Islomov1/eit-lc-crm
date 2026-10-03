import { requireRole } from "@/lib/auth";
import { periodSummary } from "@/lib/report-summary";
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
  const allRows = await periodSummary(startKey, endKey);
  const rows = allRows
    .slice((page - 1) * 30, page * 30)
    .map((r) => ({
      id: r.studentId,
      name: r.studentName,
      groupId: r.groupId,
      groupName: r.groupName,
      total: r.marked,
      present: r.present,
      homework: r.done,
      missing: r.missing,
      expected: r.expected,
      legacy: r.legacy,
    }));
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
      <div className="notice">
        Незаполненные отчёты не считаются пропусками. До начала нового учёта
        доступны только внесённые отметки.{" "}
        <Link href="/admin/parent-reports">Проверить полноту отчётов →</Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ученик</th>
              <th>Группа</th>
              <th>Занятий отмечено</th>
              <th>Присутствовал</th>
              <th>Не заполнено</th>
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
                <td>{r.missing}</td>
                <td>
                  <span
                    className={
                      "badge " +
                      (Number(r.present) / Number(r.total) >= 0.7
                        ? "green"
                        : "red")
                    }
                  >
                    {r.missing
                      ? "Данные неполные"
                      : r.total
                        ? Math.round((r.present / r.total) * 100) + "%"
                        : "—"}
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
        total={allRows.length}
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
