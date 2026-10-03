import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { money, fmtDate, pageNumber } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import Pagination from "@/components/Pagination";
import {
  saveStudent,
  archiveStudent,
  saveParent,
  unlinkParent,
  createInvite,
  updateReport,
} from "../actions";
export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("ADMIN", "DIRECTOR");
  const { id } = await params;
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const [s, groups, reports, reportCount, payments, history, sessions] =
    await Promise.all([
      prisma.student.findUnique({
        where: { id },
        include: {
          groups: { select: { id: true, name: true } },
          parents: true,
        },
      }),
      prisma.group.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.report.findMany({
        where: { studentId: id },
        orderBy: { dateKey: "desc" },
        take: 20,
        skip: (page - 1) * 20,
        include: {
          group: { select: { name: true } },
          teacher: { select: { name: true } },
        },
      }),
      prisma.report.count({ where: { studentId: id } }),
      prisma.payment.findMany({
        where: { studentId: id },
        orderBy: { periodStart: "desc" },
        take: 36,
        include: { group: { select: { name: true } } },
      }),
      prisma.auditLog.findMany({
        where: { entity: "Student", entityId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.supportSession.findMany({
        where: { studentId: id },
        orderBy: { startTime: "desc" },
        take: 20,
        include: { support: { select: { name: true } } },
      }),
    ]);
  if (!s) notFound();
  const invite =
    sp.invite &&
    (await prisma.parentInvite.findFirst({
      where: {
        studentId: id,
        code: sp.invite,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
    }));
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  return (
    <>
      <header className="page-header">
        <div>
          <Link href="/admin/students" className="eyebrow">
            ← ВСЕ УЧЕНИКИ
          </Link>
          <h1 style={{ marginTop: 12 }}>{s.name}</h1>
          <p>
            {s.archivedAt ? "В архиве" : "Активный ученик"} ·{" "}
            {s.groups.map((g) => g.name).join(" / ") || "Без группы"}
          </p>
        </div>
        <ActionForm action={archiveStudent}>
          <input type="hidden" name="id" value={id} />
          <input
            type="hidden"
            name="restore"
            value={s.archivedAt ? "1" : "0"}
          />
          <button className="btn secondary">
            {s.archivedAt ? "Восстановить" : "Перенести в архив"}
          </button>
        </ActionForm>
      </header>
      {invite && (
        <div className="notice">
          Приглашение родителя (7 дней). Сначала добавьте его телефон в
          карточку. В боте родитель подтвердит свой номер:{" "}
          {bot ? (
            <a
              href={`https://t.me/${bot}?start=${invite.code}`}
              target="_blank"
              rel="noreferrer"
            >
              Открыть Telegram →
            </a>
          ) : (
            <span>Код: {invite.code}</span>
          )}
        </div>
      )}
      <div className="two-col">
        <section className="panel">
          <h2 className="panel-title">Карточка ученика</h2>
          <ActionForm action={saveStudent} className="form-grid">
            <input type="hidden" name="id" value={id} />
            <label className="field">
              <span>ФИО</span>
              <input name="name" defaultValue={s.name} required />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input name="phone" defaultValue={s.phone || ""} />
            </label>
            <label className="field wide">
              <span>Группы · Ctrl / Cmd для нескольких</span>
              <select
                name="groupIds"
                multiple
                size={5}
                defaultValue={s.groups.map((g) => g.id)}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field wide">
              <span>Заметки администратора</span>
              <textarea name="note" defaultValue={s.note || ""} rows={4} />
            </label>
            <button className="btn">Сохранить</button>
          </ActionForm>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Родители</h2>
            <ActionForm action={createInvite}>
              <input name="studentId" type="hidden" value={id} />
              <button className="btn secondary">+ Telegram</button>
            </ActionForm>
          </div>
          {s.parents.map((p) => (
            <details
              key={p.id}
              className="list-row"
              style={{ display: "block" }}
            >
              <summary className="details-summary">
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.phone}</small>
                </div>
                <span className={"badge " + (p.telegramId ? "green" : "")}>
                  {p.telegramId ? "Подключён" : "Не подключён"}
                </span>
              </summary>
              <ActionForm action={saveParent} className="form-grid">
                <input name="id" type="hidden" value={p.id} />
                <input name="studentId" type="hidden" value={id} />
                <label className="field">
                  <span>Имя</span>
                  <input name="name" defaultValue={p.name} required />
                </label>
                <label className="field">
                  <span>Телефон</span>
                  <input name="phone" defaultValue={p.phone} required />
                </label>
                <button className="btn">Сохранить контакт</button>
              </ActionForm>
              {p.telegramId && (
                <ActionForm action={unlinkParent}>
                  <input name="id" type="hidden" value={p.id} />
                  <input name="studentId" type="hidden" value={id} />
                  <button className="btn secondary" style={{ marginTop: 12 }}>
                    Отключить Telegram
                  </button>
                </ActionForm>
              )}
            </details>
          ))}
          <details style={{ marginTop: 20 }}>
            <summary className="details-summary">Добавить родителя</summary>
            <ActionForm action={saveParent} className="form-grid">
              <input name="studentId" type="hidden" value={id} />
              <label className="field">
                <span>Имя</span>
                <input name="name" required />
              </label>
              <label className="field">
                <span>Телефон</span>
                <input name="phone" type="tel" required />
              </label>
              <button className="btn">Добавить</button>
            </ActionForm>
          </details>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 24 }}>
        <div className="panel-title">
          <h2>Оплаты по группам</h2>
          <Link
            className="btn secondary"
            href={"/admin/payments?q=" + encodeURIComponent(s.name)}
          >
            Управлять оплатами →
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Период</th>
                <th>Группа</th>
                <th>Начислено</th>
                <th>Получено</th>
                <th>Остаток</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.periodStart.toISOString().slice(0, 7)}</td>
                  <td>
                    {p.group?.name || "Без группы"}{" "}
                    {["VOID", "REFUND"].includes(p.status) && (
                      <span className="badge red">
                        {p.status === "VOID" ? "Отменено" : "Возврат"}
                      </span>
                    )}
                  </td>
                  <td>{money(p.amount)}</td>
                  <td>{money(p.paidAmount)}</td>
                  <td>
                    {money(
                      ["VOID", "REFUND"].includes(p.status)
                        ? 0
                        : Math.max(0, p.amount - p.paidAmount),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payments.length && <div className="empty">Оплат пока нет</div>}
        </div>
      </section>
      <section className="panel">
        <h2 className="panel-title">Посещаемость и домашние задания</h2>
        {reports.map((r) => (
          <details key={r.id} className="list-row" style={{ display: "block" }}>
            <summary className="details-summary">
              <div>
                <strong>
                  {r.dateKey} · {r.group.name}
                </strong>
                <small>
                  {r.teacher.name} · {r.comment || "Без комментария"}
                </small>
              </div>
              <span
                className={
                  "badge " + (r.attendance === "PRESENT" ? "green" : "red")
                }
              >
                {r.attendance === "PRESENT" ? "Присутствовал" : "Отсутствовал"}{" "}
                · ДЗ:{" "}
                {r.homework === "DONE"
                  ? "выполнено"
                  : r.homework === "PARTIAL"
                    ? "частично"
                    : "не выполнено"}
              </span>
            </summary>
            <ActionForm action={updateReport} className="form-grid">
              <input name="id" type="hidden" value={r.id} />
              <input name="studentId" type="hidden" value={id} />
              <label className="field">
                <span>Посещаемость</span>
                <select name="attendance" defaultValue={r.attendance}>
                  <option value="PRESENT">Присутствовал</option>
                  <option value="ABSENT">Отсутствовал</option>
                </select>
              </label>
              <label className="field">
                <span>Домашнее задание</span>
                <select name="homework" defaultValue={r.homework}>
                  <option value="DONE">Выполнено</option>
                  <option value="PARTIAL">Частично</option>
                  <option value="NOT_DONE">Не выполнено</option>
                </select>
              </label>
              <label className="field">
                <span>Комментарий</span>
                <input name="comment" defaultValue={r.comment || ""} />
              </label>
              <button className="btn">Исправить отметку</button>
            </ActionForm>
          </details>
        ))}
        {!reports.length && <p className="empty">Отметок пока нет</p>}
        <Pagination
          page={page}
          size={20}
          total={reportCount}
          base={"/admin/students/" + id}
        />
      </section>
      <div className="two-col" style={{ marginTop: 24 }}>
        <section className="panel">
          <h2 className="panel-title">История карточки и переводов</h2>
          <div className="timeline">
            {history.map((h) => (
              <div key={h.id}>
                <p>{h.summary}</p>
                <small>
                  {fmtDate(h.createdAt)} · {h.actorName}
                </small>
              </div>
            ))}
          </div>
          {!history.length && (
            <p className="muted">Новые изменения появятся здесь.</p>
          )}
        </section>
        <section className="panel">
          <h2 className="panel-title">Занятия поддержки</h2>
          {sessions.map((x) => (
            <div className="list-row" key={x.id}>
              <div>
                <strong>{fmtDate(x.startTime)}</strong>
                <small>
                  {x.support.name} ·{" "}
                  {Math.round((+x.endTime - +x.startTime) / 60000)} мин.
                </small>
                <p>{x.comment}</p>
              </div>
            </div>
          ))}
          {!sessions.length && <p className="muted">Занятий пока нет.</p>}
        </section>
      </div>
    </>
  );
}
