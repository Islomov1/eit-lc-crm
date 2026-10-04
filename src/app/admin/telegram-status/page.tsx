import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate, pageNumber, textField } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { saveLeadForm } from "../leads/actions";
import { deliverOne } from "@/lib/telegramDelivery";
import { revalidatePath } from "next/cache";
import Pagination from "@/components/Pagination";
import Link from "next/link";
import { learningFormatLabels } from "@/lib/lead-labels";
async function retry(f: FormData) {
  "use server";
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const row = await prisma.telegramDelivery.findUniqueOrThrow({
    where: { id },
  });
  if (row.cancelledAt)
    throw new Error("Сообщение отменено или заменено новой версией");
  if (row.attemptCount >= 10)
    throw new Error(
      "Достигнут предел попыток. Проверьте подключение родителя.",
    );
  if (row.nextRetryAt && row.nextRetryAt > new Date())
    throw new Error(
      "Следующая попытка доступна после " + fmtDate(row.nextRetryAt),
    );
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: "RETRY",
      entity: "TelegramDelivery",
      entityId: id,
      summary: "Повторная отправка сообщения по запросу сотрудника",
    },
  });
  const result = await deliverOne(id);
  revalidatePath("/admin/telegram-status");
  if (result.status === "FAILED")
    throw new Error("Telegram отклонил отправку. Подробности в журнале.");
}
async function resolve(f: FormData) {
  "use server";
  await requireRole("ADMIN", "DIRECTOR");
  await prisma.integrationError.update({
    where: { id: textField(f, "id") },
    data: { resolvedAt: new Date() },
  });
  revalidatePath("/admin/telegram-status");
}
export default async function Integrations({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const user = await requireRole("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const status = ["FAILED", "PENDING", "SENT"].includes(sp.status || "")
    ? (sp.status as "FAILED" | "PENDING" | "SENT")
    : undefined;
  const where = { cancelledAt: null, ...(status ? { status } : {}) };
  const [deliveries, total, stats, linked, parents, errors, forms] =
    await Promise.all([
      prisma.telegramDelivery.findMany({
        where,
        take: 30,
        skip: (page - 1) * 30,
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { name: true } },
          parent: { select: { name: true } },
        },
      }),
      prisma.telegramDelivery.count({ where }),
      prisma.telegramDelivery.groupBy({
        by: ["status"],
        where: { cancelledAt: null },
        _count: { _all: true },
      }),
      prisma.parent.count({ where: { telegramId: { not: null } } }),
      prisma.parent.count(),
      prisma.integrationError.findMany({
        where: { resolvedAt: null },
        take: 30,
        orderBy: { createdAt: "desc" },
      }),
      prisma.leadForm.findMany({ orderBy: { name: "asc" } }),
    ]);
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">СВЯЗЬ И ДАННЫЕ</div>
          <h1>Интеграции</h1>
          <p>Подключения, журнал доставки и формы рекламы.</p>
        </div>
      </header>
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Родители в Telegram</span>
          <strong>
            {linked} / {parents}
          </strong>
          <small>Подключение — в карточке ученика</small>
        </div>
        {(["SENT", "FAILED", "PENDING"] as const).map((s) => (
          <Link
            href={"/admin/telegram-status?status=" + s}
            className="metric"
            key={s}
          >
            <span className="metric-label">
              {
                {
                  SENT: "Отправлено в Telegram",
                  FAILED: "Ошибки доставки",
                  PENDING: "Ожидают отправки",
                }[s]
              }
            </span>
            <strong>
              {stats.find((x) => x.status === s)?._count._all || 0}
            </strong>
            <small>Открыть журнал →</small>
          </Link>
        ))}
      </div>
      <div className="notice">
        Instagram → CRM:{" "}
        {process.env.WEBHOOK_SECRET
          ? "приём заявок настроен"
          : "нужна настройка ключа"}
        . Обратные события CRM → Make:{" "}
        {process.env.MAKE_WEBHOOK_URL ? "настроены" : "не настроены"}. Повторная
        отправка новых сообщений проверяется ежедневно, 09:00–10:00 по
        Самарканду. Старые ошибки доступны для ручной проверки.
      </div>
      <section className="panel" style={{ marginBottom: 24 }}>
        <h2 className="panel-title">Заявки EIT Online · Google Sheets</h2>
        <p>
          {process.env.SHEETS_CRM_SECRET && process.env.EIT_LEADS_SPREADSHEET_ID
            ? "Приём из таблицы настроен. Проверка новых строк запускается в Google Apps Script каждые 5 минут."
            : "Приём из таблицы ещё не настроен."}
        </p>
        <p className="muted" style={{ marginTop: 12 }}>
          Заявки лендинга и placement test находятся в разделе «Лиды» с источниками website и placement.
          Исходные даты сохраняются. Тестовые строки пропускаются, повторная передача не меняет карточки.
          Результат переноса и ошибки доступны в столбцах CRM исходной таблицы.
        </p>
        <Link href="/admin/leads?source=website" className="btn secondary" style={{ marginTop: 16 }}>Заявки сайта →</Link>
      </section>
      {errors.length > 0 && (
        <section className="panel" style={{ marginBottom: 24 }}>
          <h2>Ошибки интеграций</h2>
          {errors.map((e) => (
            <div className="list-row" key={e.id}>
              <div>
                <strong>{e.service}</strong>
                <p>{e.message}</p>
                <small>{fmtDate(e.createdAt)}</small>
              </div>
              <ActionForm action={resolve}>
                <input name="id" type="hidden" value={e.id} />
                <button className="btn secondary">Отметить решённой</button>
              </ActionForm>
            </div>
          ))}
        </section>
      )}
      <form className="filters">
        <select
          name="status"
          defaultValue={status || ""}
          aria-label="Статус доставки"
        >
          <option value="">Все доставки</option>
          <option value="FAILED">Ошибки</option>
          <option value="PENDING">Ожидают</option>
          <option value="SENT">Доставлено</option>
        </select>
        <button className="btn">Показать</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ученик / родитель</th>
              <th>Дата</th>
              <th>Статус</th>
              <th>Ошибка</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={"/admin/students/" + d.studentId}>
                    <strong>{d.student.name}</strong>
                  </Link>
                  <p className="muted">{d.parent.name}</p>
                </td>
                <td>{fmtDate(d.createdAt)}</td>
                <td>
                  <span
                    className={
                      "badge " +
                      (d.status === "SENT"
                        ? "green"
                        : d.status === "FAILED"
                          ? "red"
                          : "blue")
                    }
                  >
                    {
                      {
                        SENT: "Отправлено в Telegram",
                        FAILED: "Ошибка",
                        PENDING: "В очереди",
                      }[d.status]
                    }
                  </span>
                  <p className="muted">Попыток: {d.attemptCount}</p>
                </td>
                <td style={{ maxWidth: 250, overflowWrap: "anywhere" }}>
                  {d.error || "—"}
                </td>
                <td>
                  {d.status !== "SENT" && (
                    <ActionForm action={retry}>
                      <input name="id" type="hidden" value={d.id} />
                      <button className="btn secondary">
                        Повторить отправку
                      </button>
                    </ActionForm>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!deliveries.length && <p className="empty">Записей нет</p>}
      </div>
      <Pagination
        page={page}
        total={total}
        base="/admin/telegram-status"
        params={{ status: status || "" }}
      />
      {user.role === "DIRECTOR" && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h2 className="panel-title">Курсы по формам Instagram</h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            Для новых форм укажите ID из Meta. Неизвестные формы сохраняются как
            лиды без курса.
          </p>
          <div className="stack">
            {[...forms, { id: "", name: "", program: "", learningFormat: "UNKNOWN" }].map((f, i) => (
              <ActionForm
                key={f.id || i}
                action={saveLeadForm}
                className="form-grid"
              >
                <label className="field">
                  <span>ID формы</span>
                  <input
                    name="id"
                    defaultValue={f.id}
                    required
                    readOnly={!!f.id}
                  />
                </label>
                <label className="field">
                  <span>Название</span>
                  <input name="name" defaultValue={f.name} required />
                </label>
                <label className="field">
                  <span>Курс</span>
                  <input name="program" defaultValue={f.program} required />
                </label>
                <label className="field">
                  <span>Формат обучения</span>
                  <select name="learningFormat" defaultValue={f.learningFormat}>
                    {Object.entries(learningFormatLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <button className="btn secondary">
                  {f.id ? "Сохранить" : "Добавить форму"}
                </button>
              </ActionForm>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
