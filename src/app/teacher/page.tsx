import { RefreshReports } from "@/components/RefreshReports";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateKey } from "@/lib/format";
import { validDateKey } from "@/lib/lessons";
import { ActionForm } from "@/components/ActionForm";
import { ReportEditor } from "@/components/ReportEditor";
import { saveLessonAction } from "./actions";
export default async function TeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; schedule?: string }>;
}) {
  const actor = await requireRole("TEACHER");
  const sp = await searchParams;
  const today = dateKey();
  const selected =
    sp.date && validDateKey(sp.date) && sp.date <= today ? sp.date : today;
  const day = new Date(selected + "T12:00:00Z").getUTCDay();
  const schedule =
    sp.schedule === "MWF" || sp.schedule === "TTS"
      ? sp.schedule
      : [2, 4, 6].includes(day)
        ? "TTS"
        : "MWF";
  const groups = await prisma.group.findMany({
    where: { teacherId: actor.id, archivedAt: null, schedule },
    include: {
      students: {
        where: { archivedAt: null },
        include: { parents: { select: { id: true, telegramId: true } } },
        orderBy: { name: "asc" },
      },
      lessons: {
        where: { dateKey: selected },
        include: {
          students: {
            include: {
              student: {
                include: {
                  parents: { select: { id: true, telegramId: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });
  const reports = await prisma.report.findMany({
    where: { groupId: { in: groups.map((g) => g.id) }, dateKey: selected },
    include: { revisions: { orderBy: { version: "desc" } } },
  });
  const deliveries = await prisma.telegramDelivery.findMany({
    where: {
      sourceType: "REPORT",
      sourceId: { in: reports.map((r) => r.id) },
      cancelledAt: null,
    },
    select: { sourceId: true, sourceVersion: true, status: true },
  });
  const linked = new Map(
    reports.map((r) => [r.studentId + ":" + r.groupId, r]),
  );
  const count = groups.reduce(
    (sum, g) => sum + (g.lessons[0]?.students.length ?? g.students.length),
    0,
  );
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">УЧЕБНЫЙ ПРОЦЕСС</div>
          <h1>Мои занятия</h1>
          <p>
            Отчёт родителю — после сохранения. Незаполненная отметка не
            считается пропуском.
          </p>
        </div>
        <Link className="btn secondary" href="/teacher/reports">
          Сводные отчёты →
        </Link>
      </header>
      <form className="filters">
        <label className="field">
          <span>Дата занятия</span>
          <input type="date" name="date" max={today} defaultValue={selected} />
        </label>
        <label className="field">
          <span>Расписание</span>
          <select name="schedule" defaultValue={schedule}>
            <option value="MWF">Пн · Ср · Пт</option>
            <option value="TTS">Вт · Чт · Сб</option>
          </select>
        </label>
        <button className="btn">Показать</button>
      </form>
      <div style={{ marginBottom: 16 }}>
        <RefreshReports />
      </div>
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Групп</span>
          <strong>{groups.length}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Отчётов сохранено</span>
          <strong>{reports.length}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Не заполнено</span>
          <strong>{Math.max(0, count - reports.length)}</strong>
        </div>
      </div>
      {!groups.length && (
        <div className="empty panel">На это расписание групп нет.</div>
      )}
      {groups.map((group) => {
        const lesson = group.lessons[0];
        const students = lesson
          ? lesson.students
              .map((s) => s.student)
              .filter((s) => !s.archivedAt)
              .sort((a, b) => a.name.localeCompare(b.name))
          : group.students;
        return (
          <section className="panel lesson-panel" key={group.id}>
            <div className="panel-title">
              <div>
                <h2>{group.name}</h2>
                <p className="muted">
                  {group.startTime}–{group.endTime} ·{" "}
                  {selected.split("-").reverse().join(".")} · {students.length}{" "}
                  учеников
                </p>
              </div>
              {lesson?.cancelledAt && (
                <span className="badge red">
                  Отменено: {lesson.cancelReason}
                </span>
              )}
            </div>
            <details open={!lesson?.topic} className="lesson-details">
              <summary>
                Тема и задание для группы
                {lesson?.topic ? ": " + lesson.topic : ""}
              </summary>
              <p className="muted">
                Общие сведения попадут в новые отчёты. Уже отправленные отчёты
                исправляются отдельно. При сохранении добавятся новые ученики
                сегодняшней группы.
              </p>
              <ActionForm action={saveLessonAction} className="form-grid">
                <input type="hidden" name="groupId" value={group.id} />
                <input type="hidden" name="dateKey" value={selected} />
                <label className="field wide">
                  <span>Тема занятия</span>
                  <input
                    name="topic"
                    required
                    maxLength={180}
                    defaultValue={lesson?.topic || ""}
                  />
                </label>
                <label className="field">
                  <span>Что изучили</span>
                  <textarea
                    name="covered"
                    maxLength={500}
                    defaultValue={lesson?.covered || ""}
                  />
                </label>
                <label className="field">
                  <span>Задание к следующему занятию</span>
                  <textarea
                    name="assignment"
                    maxLength={600}
                    defaultValue={lesson?.assignment || ""}
                  />
                </label>
                <button className="btn secondary">
                  {lesson?.cancelledAt
                    ? "Восстановить занятие"
                    : "Сохранить тему и список"}
                </button>
              </ActionForm>
              {!lesson?.cancelledAt &&
                !reports.some((r) => r.groupId === group.id) && (
                  <details>
                    <summary>Отменить занятие</summary>
                    <ActionForm action={saveLessonAction} className="filters">
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="dateKey" value={selected} />
                      <input type="hidden" name="cancel" value="1" />
                      <input
                        name="reason"
                        required
                        maxLength={300}
                        placeholder="Причина отмены"
                        aria-label="Причина отмены"
                      />
                      <button className="btn secondary">
                        Отменить занятие
                      </button>
                    </ActionForm>
                  </details>
                )}
            </details>
            {!lesson?.cancelledAt &&
              students.map((student) => {
                const r = linked.get(student.id + ":" + group.id);
                const linkedParents = student.parents.filter(
                  (p) => p.telegramId !== null,
                ).length;
                const sent = r
                  ? deliveries.filter(
                      (d) =>
                        d.sourceId === r.id && d.sourceVersion === r.version,
                    )
                  : [];
                const status = !r
                  ? "Не заполнено"
                  : !linkedParents
                    ? "Родитель не подключён"
                    : sent.length === 0
                      ? "Нет записи об отправке"
                      : sent.some((d) => d.status === "FAILED")
                        ? "Ошибка отправки"
                        : sent.every((d) => d.status === "SENT")
                          ? "Отправлено в Telegram"
                          : "В очереди";
                return (
                  <details className="student-report" key={student.id}>
                    <summary className="details-summary">
                      <div>
                        <strong>{student.name}</strong>
                        <small>
                          {r
                            ? `${r.attendance === "PRESENT" ? "Присутствовал" : "Отсутствовал"} · Версия ${r.version}`
                            : "Отметка ещё не внесена"}
                        </small>
                      </div>
                      <span
                        className={
                          "badge " +
                          (status === "Отправлено в Telegram"
                            ? "green"
                            : status === "Ошибка отправки"
                              ? "red"
                              : "")
                        }
                      >
                        {status}
                      </span>
                    </summary>
                    {!linkedParents && (
                      <p className="notice">
                        Отчёт сохранится в CRM. Для получения сообщений родитель
                        должен подключить Telegram через карточку ученика.
                      </p>
                    )}
                    {!lesson?.topic && !r && (
                      <p className="notice">
                        Сначала сохраните тему занятия выше.
                      </p>
                    )}
                    <ReportEditor
                      studentId={student.id}
                      groupId={group.id}
                      dateKey={selected}
                      report={r}
                      disabled={!r && !lesson?.topic}
                    />
                  </details>
                );
              })}
          </section>
        );
      })}
    </>
  );
}
