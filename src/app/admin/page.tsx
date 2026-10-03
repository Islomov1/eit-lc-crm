import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { debtSummary } from "@/lib/dashboard";
import { dateKey, fmtDate, money, monthWindow } from "@/lib/format";
import Link from "next/link";
export default async function Dashboard() {
  const user = await requireRole("ADMIN", "DIRECTOR");
  const today = dateKey();
  const { start, end, month } = monthWindow(today.slice(0, 7));
  const now = new Date();
  const weekDay = new Date(today + "T12:00:00Z").getUTCDay();
  const schedule =
    weekDay === 0 ? null : [1, 3, 5].includes(weekDay) ? "MWF" : "TTS";
  const [
    students,
    newLeads,
    due,
    lessons,
    absent,
    debt,
    followups,
    latest,
    finance,
  ] = await Promise.all([
    prisma.student.count({ where: { archivedAt: null } }),
    prisma.lead.count({ where: { status: "NEW", archivedAt: null } }),
    prisma.lead.count({
      where: {
        archivedAt: null,
        status: { in: ["NEW", "ACTIVE", "FROZEN"] },
        followUpAt: { lte: now },
      },
    }),
    schedule
      ? prisma.group.findMany({
          where: { archivedAt: null, schedule },
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
            teacher: { select: { name: true } },
            _count: { select: { students: { where: { archivedAt: null } } } },
          },
        })
      : Promise.resolve([]),
    prisma.report.count({ where: { dateKey: today, attendance: "ABSENT" } }),
    debtSummary(month),
    prisma.lead.findMany({
      where: {
        archivedAt: null,
        status: { in: ["NEW", "ACTIVE", "FROZEN"] },
        followUpAt: { lte: new Date(today + "T23:59:59+05:00") },
      },
      orderBy: { followUpAt: "asc" },
      take: 6,
      select: { id: true, name: true, phone: true, followUpAt: true },
    }),
    prisma.lead.findMany({
      where: { archivedAt: null, status: "NEW" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, program: true, source: true },
    }),
    user.role === "DIRECTOR"
      ? Promise.all([
          prisma.payment.aggregate({
            where: {
              periodStart: { gte: start, lt: end },
              status: { in: ["PAID", "PARTIAL"] },
            },
            _sum: { paidAmount: true },
          }),
          prisma.expense.aggregate({
            where: { date: { gte: start, lt: end } },
            _sum: { amount: true },
          }),
        ])
      : Promise.resolve(null),
  ]);
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">EIT OPERATING SYSTEM</div>
          <h1>Рабочий день</h1>
          <p>
            {new Intl.DateTimeFormat("ru-RU", {
              timeZone: "Asia/Samarkand",
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(now)}{" "}
            · Здравствуйте, {user.name}.
          </p>
        </div>
        <Link href="/admin/leads" className="btn">
          К новым заявкам →
        </Link>
      </header>
      <div className="metric-grid">
        <Link href="/admin/students" className="metric">
          <span className="metric-label">Активные ученики</span>
          <strong>{students}</strong>
          <small>Карточки и группы</small>
        </Link>
        <Link href="/admin/leads?status=NEW" className="metric accent">
          <span className="metric-label">Новые лиды</span>
          <strong>{newLeads}</strong>
          <small>Ожидают первого контакта</small>
        </Link>
        <Link href="/admin/leads?due=1" className="metric">
          <span className="metric-label">Пора связаться</span>
          <strong>{due}</strong>
          <small>Срок контакта наступил</small>
        </Link>
        <Link href="/admin/payments" className="metric">
          <span className="metric-label">Ученики с долгом</span>
          <strong>{debt.count}</strong>
          <small>
            {money(debt.total)} · {month}
          </small>
        </Link>
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="panel-title">
            <h2>Занятия сегодня</h2>
            <Link className="badge" href="/admin/timetable">
              Расписание →
            </Link>
          </div>
          {lessons.map((g) => (
            <div className="list-row" key={g.id}>
              <span className="badge blue">
                {g.startTime}–{g.endTime}
              </span>
              <div style={{ flex: 1 }}>
                <strong>{g.name}</strong>
                <small>
                  {g.teacher?.name || "Без преподавателя"} · {g._count.students}{" "}
                  учеников
                </small>
              </div>
            </div>
          ))}
          {!lessons.length && (
            <p className="empty">На сегодня занятий по расписанию нет.</p>
          )}
          <Link className="list-row muted" href="/admin/attendance">
            Отсутствуют по сегодняшним отметкам <strong>{absent}</strong>
          </Link>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Контакты на сегодня</h2>
            <Link className="badge" href="/admin/leads?due=1">
              Все задачи →
            </Link>
          </div>
          {followups.map((l) => (
            <Link href={"/admin/leads/" + l.id} className="list-row" key={l.id}>
              <div>
                <strong>{l.name}</strong>
                <small>{l.phone || "Нет телефона"}</small>
              </div>
              <small className="error-text">{fmtDate(l.followUpAt!)}</small>
            </Link>
          ))}
          {!followups.length && (
            <p className="empty">Запланированных контактов на сегодня нет.</p>
          )}
          <h2 style={{ marginTop: 28 }}>Последние заявки</h2>
          {latest.map((l) => (
            <Link href={"/admin/leads/" + l.id} className="list-row" key={l.id}>
              <div>
                <strong>{l.name}</strong>
                <small>
                  {l.program || "Курс не указан"} · {l.source}
                </small>
              </div>
              <span>→</span>
            </Link>
          ))}
        </section>
      </div>
      {finance && (
        <section className="panel" style={{ marginTop: 24 }}>
          <div className="panel-title">
            <h2>Финансы · {month}</h2>
            <Link className="badge" href="/admin/analytics">
              Аналитика →
            </Link>
          </div>
          <div className="metric-grid" style={{ margin: 0 }}>
            <div>
              <p className="muted">Получено за учебный период</p>
              <h2>{money(finance[0]._sum.paidAmount || 0)}</h2>
            </div>
            <div>
              <p className="muted">Расходы</p>
              <h2>{money(finance[1]._sum.amount || 0)}</h2>
            </div>
            <div>
              <p className="muted">Разница</p>
              <h2>
                {money(
                  (finance[0]._sum.paidAmount || 0) -
                    (finance[1]._sum.amount || 0),
                )}
              </h2>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
