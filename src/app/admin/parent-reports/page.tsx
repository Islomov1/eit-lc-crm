import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateKey, fmtDate } from "@/lib/format";
import { previousWeek, addDays } from "@/lib/lessons";
import { periodSummary, trackingGaps } from "@/lib/report-summary";
import { weeklyMessage, reportLanguage } from "@/lib/report-messages";
export default async function ParentReports() {
  await requireRole("ADMIN", "DIRECTOR");
  const week = previousWeek();
  const today = dateKey();
  const [config, rows, gaps, parents, failures] = await Promise.all([
    prisma.reportAutomation.findUnique({ where: { id: "parent-reports" } }),
    periodSummary(week.start, week.next),
    trackingGaps(week.start, addDays(today, 1)),
    prisma.parent.findMany({
      where: { student: { archivedAt: null } },
      select: {
        id: true,
        studentId: true,
        telegramId: true,
        reportLanguage: true,
        weeklyReports: true,
      },
    }),
    prisma.telegramDelivery.count({
      where: {
        cancelledAt: null,
        sourceType: { in: ["REPORT", "WEEKLY_REPORT"] },
        status: "FAILED",
      },
    }),
  ]);
  const current = await periodSummary(week.next, addDays(today, 1));
  const incomplete = current.filter((r) => r.missing > 0);
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">СВЯЗЬ С СЕМЬЁЙ</div>
          <h1>Отчёты родителям</h1>
          <p>
            Полнота отчётов, подключение родителей и предпросмотр недельной
            сводки.
          </p>
        </div>
        <Link href="/admin/telegram-status" className="btn secondary">
          Журнал отправки →
        </Link>
      </header>
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Не заполнено за неделю</span>
          <strong>{incomplete.reduce((s, r) => s + r.missing, 0)}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Родители не подключены</span>
          <strong>{parents.filter((p) => p.telegramId === null).length}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Ошибки отправки</span>
          <strong>{failures}</strong>
        </div>
      </div>
      <div className="notice">
        Учёт списков — с {config?.trackingStartsOn || "даты запуска"}.
        Автоматизация: {config?.enabled ? "включена" : "не включена"}. Проверка
        очереди — ежедневно, 09:00–10:00 по Самарканду. Недельная сводка — за
        предыдущую полную неделю; формируется в понедельник, при сбое
        повторяется следующим утром. Первый неполный период не рассылается.{" "}
        <br />
        Последний успешный запуск:{" "}
        {config?.lastSuccessAt
          ? fmtDate(config.lastSuccessAt)
          : "ещё не выполнялся"}
        .
        {config?.lastError && (
          <p className="error-text">
            Последняя проверка завершилась с ошибкой.
          </p>
        )}
      </div>
      <section className="panel">
        <h2 className="panel-title">Текущая неделя · нужны отметки</h2>
        {incomplete.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ученик</th>
                  <th>Группа</th>
                  <th>Не заполнено</th>
                </tr>
              </thead>
              <tbody>
                {incomplete.map((r) => (
                  <tr key={r.studentId + r.groupId}>
                    <td>
                      <Link href={"/admin/students/" + r.studentId}>
                        {r.studentName}
                      </Link>
                    </td>
                    <td>{r.groupName}</td>
                    <td>{r.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            В созданных списках завершённых занятий незаполненных отметок нет.
          </p>
        )}
      </section>
      {!!gaps.length && (
        <section className="panel">
          <h2>Занятия без списка</h2>
          <p className="muted">
            Проверьте расписание и отмены. Эти занятия не включены в проценты:
            исторический список учеников неизвестен.
          </p>
          {gaps.slice(0, 80).map((g) => (
            <p key={g.groupId + g.dateKey}>
              {g.dateKey} · {g.name}
            </p>
          ))}
        </section>
      )}
      <section className="panel">
        <h2 className="panel-title">
          Предпросмотр сводки · {week.start}–{week.end}
        </h2>
        <p className="muted">
          Только просмотр. Эта страница не отправляет сообщения. Темы и
          комментарии показываются на языке преподавателя.
        </p>
        {rows.map((r) => {
          const ps = parents.filter((p) => p.studentId === r.studentId);
          return (
            <details className="student-report" key={r.studentId + r.groupId}>
              <summary className="details-summary">
                <div>
                  <strong>{r.studentName}</strong>
                  <small>{r.groupName}</small>
                </div>
                <span className="badge">
                  {r.marked} из {r.expected} отчётов
                </span>
              </summary>
              <p className="muted">
                Подключено родителей:{" "}
                {ps.filter((p) => p.telegramId !== null).length} · Сводка
                включена: {ps.filter((p) => p.weeklyReports).length}
              </p>
              <pre className="parent-message">
                {weeklyMessage(
                  {
                    ...r,
                    start: week.start,
                    end: week.end,
                    untracked: gaps.filter(
                      (g) => g.groupId === r.groupId && g.dateKey < week.next,
                    ).length,
                  },
                  reportLanguage(ps[0]?.reportLanguage || "RU"),
                )}
              </pre>
              <Link href={"/admin/students/" + r.studentId}>
                Карточка ученика →
              </Link>
            </details>
          );
        })}
        {!rows.length && (
          <p className="empty">За предыдущую неделю данных пока нет.</p>
        )}
      </section>
    </>
  );
}
