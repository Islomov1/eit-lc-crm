import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  dateKey,
  monthWindow,
  money,
  fmtDate,
  textField,
  pageNumber,
} from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import Pagination from "@/components/Pagination";
async function saveExpense(f: FormData) {
  "use server";
  const actor = await requireRole("DIRECTOR");
  const id = textField(f, "id");
  const amount = Number(f.get("amount"));
  const category = textField(f, "category", 100);
  const description = textField(f, "description", 2000);
  const rawDate = textField(f, "date");
  const date = new Date(rawDate + "T12:00:00+05:00");
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 1e9 ||
    !category ||
    !Number.isFinite(+date)
  )
    throw new Error("Проверьте сумму, категорию и дату");
  await prisma.$transaction(async (tx) => {
    const old = id
      ? await tx.expense.findUniqueOrThrow({ where: { id } })
      : null;
    const data = { amount, category, description: description || null, date };
    const row = id
      ? await tx.expense.update({ where: { id }, data })
      : await tx.expense.create({ data: { ...data, createdById: actor.id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: id ? "UPDATE" : "CREATE",
        entity: "Expense",
        entityId: row.id,
        summary: `${category}: ${old?.amount || 0} → ${amount} сум · ${description}`,
      },
    });
  });
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/analytics");
}
async function deleteExpense(f: FormData) {
  "use server";
  const actor = await requireRole("DIRECTOR");
  if (f.get("confirm") !== "yes")
    throw new Error("Подтвердите удаление ошибочной записи");
  const id = textField(f, "id");
  await prisma.$transaction(async (tx) => {
    const row = await tx.expense.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: "DELETE",
        entity: "Expense",
        entityId: id,
        summary: `Удалён расход ${row.amount} сум · ${row.category} · ${row.date.toISOString()} · ${row.description || ""}`,
      },
    });
  });
  revalidatePath("/admin/expenses");
}
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; page?: string }>;
}) {
  await requireRole("DIRECTOR");
  const sp = await searchParams;
  const { month, start, end } = monthWindow(sp.month || dateKey().slice(0, 7));
  const page = pageNumber(sp.page);
  const where = { date: { gte: start, lt: end } };
  const [rows, summary, categories] = await Promise.all([
    prisma.expense.findMany({
      where,
      take: 30,
      skip: (page - 1) * 30,
      orderBy: { date: "desc" },
    }),
    prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
    prisma.expense.groupBy({
      by: ["category"],
      where,
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
  ]);
  function fields(e?: (typeof rows)[number]) {
    return (
      <>
        <input type="hidden" name="id" value={e?.id || ""} />
        <label className="field">
          <span>Сумма, сум</span>
          <input
            name="amount"
            type="number"
            min={1}
            max={1000000000}
            defaultValue={e?.amount}
            required
          />
        </label>
        <label className="field">
          <span>Категория</span>
          <input
            name="category"
            list="categories"
            defaultValue={e?.category}
            required
          />
        </label>
        <label className="field">
          <span>Дата</span>
          <input
            name="date"
            type="date"
            defaultValue={e ? dateKey(e.date) : dateKey()}
            required
          />
        </label>
        <label className="field">
          <span>Описание</span>
          <input name="description" defaultValue={e?.description || ""} />
        </label>
        <button className="btn">Сохранить расход</button>
      </>
    );
  }
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">ФИНАНСЫ</div>
          <h1>Расходы</h1>
          <p>
            {summary._count} записей · {money(summary._sum.amount || 0)}
          </p>
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
      <datalist id="categories">
        {[
          ...new Set([
            "Аренда",
            "Зарплата",
            "Коммунальные",
            "Маркетинг",
            "Оборудование",
            "Интернет",
            "Другое",
            ...categories.map((c) => c.category),
          ]),
        ].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </datalist>
      <div className="metric-grid">
        {categories.map((c) => (
          <div className="metric" key={c.category}>
            <span className="metric-label">{c.category}</span>
            <strong style={{ fontSize: 23 }}>
              {money(c._sum.amount || 0)}
            </strong>
          </div>
        ))}
      </div>
      <details className="panel" style={{ marginBottom: 24 }}>
        <summary className="details-summary">
          <h2>Добавить расход</h2>
        </summary>
        <ActionForm action={saveExpense} className="form-grid">
          {fields()}
        </ActionForm>
      </details>
      <div className="stack">
        {rows.map((e) => (
          <details className="panel" key={e.id}>
            <summary className="details-summary">
              <div>
                <strong>{e.category}</strong>
                <p className="muted">
                  {fmtDate(e.date)} · {e.description}
                </p>
              </div>
              <strong>{money(e.amount)}</strong>
            </summary>
            <ActionForm action={saveExpense} className="form-grid">
              {fields(e)}
            </ActionForm>
            <ActionForm action={deleteExpense} className="filters">
              <input name="id" type="hidden" value={e.id} />
              <label style={{ marginTop: 20 }}>
                <input name="confirm" type="checkbox" value="yes" required />{" "}
                Это ошибочная запись
              </label>
              <button className="btn danger" style={{ marginTop: 12 }}>
                Удалить запись
              </button>
            </ActionForm>
          </details>
        ))}
      </div>
      <Pagination
        page={page}
        total={summary._count}
        base="/admin/expenses"
        params={{ month }}
      />
    </>
  );
}
