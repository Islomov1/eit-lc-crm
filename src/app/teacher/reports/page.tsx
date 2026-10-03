import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateKey, monthWindow } from "@/lib/format";
import { addDays, validDateKey } from "@/lib/lessons";
import { periodSummary, trackingGaps } from "@/lib/report-summary";
export default async function TeacherReports({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    groupId?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const actor = await requireRole("TEACHER");
  const sp = await searchParams;
  const month = monthWindow(sp.month || dateKey().slice(0, 7));
  const start =
    sp.dateFrom && validDateKey(sp.dateFrom)
      ? sp.dateFrom
      : month.month + "-01";
  const end =
    sp.dateTo &&
    validDateKey(sp.dateTo) &&
    sp.dateTo >= start &&
    sp.dateTo <= addDays(start, 366)
      ? addDays(sp.dateTo, 1)
      : month.end.toISOString().slice(0, 10);
  const groups = await prisma.group.findMany({
    where: { teacherId: actor.id, archivedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const ids = groups
    .filter((g) => !sp.groupId || g.id === sp.groupId)
    .map((g) => g.id);
  const [rows, gaps] = await Promise.all([
    periodSummary(start, end, ids),
    trackingGaps(start, end, ids),
  ]);
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">УЧЕБНЫЙ ПРОЦЕСС</div>
          <h1>Отчёты по ученикам</h1>
          <p>
            Отдельная строка для каждой группы. Незаполненные отчёты не
            считаются пропусками.
          </p>
        </div>
        <Link href="/teacher" className="btn secondary">
          Заполнить отчёты →
        </Link>
      </header>
      <form className="filters">
        <label className="field">
          <span>Месяц</span>
          <input type="month" name="month" defaultValue={month.month} />
        </label>
        <label className="field">
          <span>Группа</span>
          <select name="groupId" defaultValue={sp.groupId || ""}>
            <option value="">Все мои группы</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn">Показать</button>
      </form>
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Отчётов</span>
          <strong>{rows.reduce((s, r) => s + r.marked, 0)}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Не заполнено</span>
          <strong>{rows.reduce((s, r) => s + r.missing, 0)}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Без списка занятия</span>
          <strong>{gaps.length}</strong>
        </div>
      </div>
      <div className="notice">
        До начала нового учёта доступны только внесённые отметки. Исторический
        состав групп не восстанавливается. Текущие занятия учитываются после
        времени окончания.
      </div>
      {!!gaps.length && (
        <section className="panel">
          <h2>Проверьте занятия без списка</h2>
          <p className="muted">
            Процент за этот период может быть неполным. Список на прошлую дату
            не создаётся автоматически.
          </p>
          {gaps.slice(0, 50).map((g) => (
            <p key={g.groupId + g.dateKey}>
              {g.dateKey} · {g.name}
            </p>
          ))}
        </section>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ученик / группа</th>
              <th>Занятий</th>
              <th>Присутствовал</th>
              <th>Отсутствовал</th>
              <th>Не заполнено</th>
              <th>Посещаемость</th>
              <th>ДЗ полностью / частично</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId + r.groupId}>
                <td>
                  <strong>{r.studentName}</strong>
                  <p className="muted">{r.groupName}</p>
                </td>
                <td>
                  {r.expected}
                  {r.legacy > 0 && (
                    <small>
                      В том числе {r.legacy} без исторического списка
                    </small>
                  )}
                </td>
                <td>{r.present}</td>
                <td>{r.marked - r.present}</td>
                <td>
                  <span className={"badge " + (r.missing ? "red" : "green")}>
                    {r.missing}
                  </span>
                </td>
                <td>
                  {r.missing
                    ? "Данные неполные"
                    : r.marked
                      ? Math.round((r.present / r.marked) * 100) + "%"
                      : "—"}
                </td>
                <td>
                  {r.done} / {r.partial} из {r.marked} отметок
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="empty">За выбранный период отчётов нет.</p>
        )}
      </div>
    </>
  );
}
