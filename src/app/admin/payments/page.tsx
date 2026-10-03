import { requireRole } from "@/lib/auth";
import { ledger } from "@/lib/payments";
import { money, dateKey, pageNumber } from "@/lib/format";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import Pagination from "@/components/Pagination";
import {
  getTeachers,
  saveStudentPayment,
  sendPaymentReminders,
} from "./actions";
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const month = sp.month || dateKey().slice(0, 7);
  const teacherId = sp.teacherId || "";
  const q = sp.q || "";
  const [data, teachers] = await Promise.all([
    ledger({ month, teacherId, q, page }),
    getTeachers(),
  ]);
  const query = new URLSearchParams({ month: data.month, teacherId, q });
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">ФИНАНСЫ УЧЕБНОГО ЦЕНТРА</div>
          <h1>Оплаты</h1>
          <p>Отдельное начисление для каждой группы и месяца.</p>
        </div>
        <div className="filters" style={{ margin: 0 }}>
          <Link
            className="btn secondary"
            href={"/admin/payments/export?" + query}
          >
            Скачать Excel
          </Link>
          <Link
            className="btn secondary"
            href={"/admin/payments/print?" + query}
          >
            Печатная ведомость
          </Link>
        </div>
      </header>
      <form className="filters">
        <input
          type="month"
          name="month"
          defaultValue={data.month}
          aria-label="Месяц"
        />
        <select
          name="teacherId"
          defaultValue={teacherId}
          aria-label="Преподаватель"
        >
          <option value="">Все преподаватели</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q}
          placeholder="Имя ученика"
          aria-label="Ученик"
        />
        <button className="btn">Показать</button>
      </form>
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Начислено · эта страница</span>
          <strong>
            {money(
              data.rows
                .filter((r) => !["VOID", "REFUND"].includes(r.status))
                .reduce((a, r) => a + r.amount, 0),
            )}
          </strong>
        </div>
        <div className="metric accent">
          <span className="metric-label">Получено · эта страница</span>
          <strong>
            {money(data.rows.reduce((a, r) => a + r.paidAmount, 0))}
          </strong>
        </div>
        <div className="metric">
          <span className="metric-label">Остаток · эта страница</span>
          <strong>{money(data.rows.reduce((a, r) => a + r.balance, 0))}</strong>
        </div>
      </div>
      <div className="stack">
        {data.rows.map((r) => (
          <details className="panel" key={r.key}>
            <summary className="details-summary">
              <div>
                <strong>{r.studentName}</strong>
                <p className="muted">
                  {r.groupName} · {r.teacherName}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className={"badge " + (r.balance > 0 ? "red" : "green")}>
                  {r.status === "VOID"
                    ? "Отменено"
                    : r.status === "REFUND"
                      ? "Возврат"
                      : r.balance > 0
                        ? "Остаток " + money(r.balance)
                        : "Оплачено"}
                </span>
                <p className="muted">Получено {money(r.paidAmount)}</p>
              </div>
            </summary>
            <ActionForm action={saveStudentPayment} className="form-grid">
              <input type="hidden" name="studentId" value={r.studentId} />
              <input type="hidden" name="groupId" value={r.groupId} />
              <input type="hidden" name="month" value={data.month} />
              <input type="hidden" name="version" value={r.updatedAt} />
              <label className="field">
                <span>Базовая стоимость, сум</span>
                <input
                  type="number"
                  name="baseAmount"
                  defaultValue={r.baseAmount}
                  min={0}
                  max={1000000000}
                  required
                />
              </label>
              <label className="field">
                <span>Скидка, %</span>
                <input
                  type="number"
                  name="discountPct"
                  defaultValue={r.discountPct}
                  min={0}
                  max={100}
                  required
                />
              </label>
              <label className="field">
                <span>Доплата, сум</span>
                <input
                  type="number"
                  name="bonus"
                  defaultValue={r.bonus}
                  min={0}
                  max={1000000000}
                  required
                />
              </label>
              <label className="field">
                <span>Всего получено за месяц, сум</span>
                <input
                  type="number"
                  name="received"
                  defaultValue={r.paidAmount}
                  min={0}
                  max={1000000000}
                  required
                />
              </label>
              <label className="field">
                <span>Способ оплаты</span>
                <select name="method" defaultValue={r.method}>
                  {Object.entries({
                    CASH: "Наличные",
                    CARD: "Карта",
                    TRANSFER: "Перевод",
                    CLICK: "Click",
                    PAYME: "Payme",
                    OTHER: "Другое",
                  }).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Состояние</span>
                <select
                  name="status"
                  defaultValue={
                    r.status === "VOID" || r.status === "REFUND"
                      ? r.status
                      : "PARTIAL"
                  }
                >
                  <option value="PARTIAL">
                    Рассчитать по полученной сумме
                  </option>
                  <option value="VOID">Отменить начисление</option>
                  <option value="REFUND">Полный возврат</option>
                </select>
              </label>
              <label className="field wide">
                <span>Комментарий / причина отмены</span>
                <textarea name="note" defaultValue={r.note} rows={2} />
              </label>
              <p className="muted wide">
                Статус «Оплачено» выставляется после полной оплаты. «Получено» —
                итог за месяц, не сумма последнего взноса. Возврат и отмена
                обнуляют полученную сумму; история сохраняется.
              </p>
              <button className="btn">Сохранить оплату</button>
              <Link
                className="btn secondary"
                href={"/admin/students/" + r.studentId}
              >
                Карточка ученика
              </Link>
            </ActionForm>
          </details>
        ))}
      </div>
      {!data.rows.length && (
        <div className="panel empty">Начислений за этот период не найдено</div>
      )}
      <Pagination
        page={page}
        total={data.total}
        base="/admin/payments"
        params={{ month: data.month, teacherId, q }}
      />
      <details className="panel" style={{ marginTop: 24 }}>
        <summary className="details-summary">
          <h2>Напомнить родителям об оплате</h2>
        </summary>
        <ActionForm action={sendPaymentReminders} className="form-grid">
          <input type="hidden" name="month" value={data.month} />
          <input type="hidden" name="teacherId" value={teacherId} />
          <p className="muted wide">
            Отправка по всем должникам выбранного месяца и преподавателя.
            Повторные нажатия в тот же день не создают дубли.
          </p>
          <label className="wide">
            <input type="checkbox" name="confirm" value="yes" required />{" "}
            Отправить напоминания родителям в Telegram
          </label>
          <button className="btn">Отправить напоминания</button>
        </ActionForm>
      </details>
    </>
  );
}
