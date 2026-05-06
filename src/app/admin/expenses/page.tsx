import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const revalidate = 0;

const DEFAULT_CATEGORIES = [
  "Аренда / Ijara",
  "Зарплата / Maosh",
  "Коммунальные / Kommunal",
  "Маркетинг / Marketing",
  "Оборудование / Jihozlar",
  "Канцелярия / Kantselyariya",
  "Интернет / Internet",
  "Транспорт / Transport",
  "Ремонт / Ta'mirlash",
  "Другое / Boshqa",
];

/* ── actions ─────────────────────────────────────────────── */

async function createExpense(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) return;

  const amount = Number(formData.get("amount"));
  const category = formData.get("category")?.toString().trim();
  const description = formData.get("description")?.toString().trim();
  const date = formData.get("date")?.toString();

  if (!amount || !category) return;

  await prisma.expense.create({
    data: {
      amount: Math.trunc(amount),
      category,
      description: description || null,
      date: date ? new Date(date) : new Date(),
      createdById: userId,
    },
  });

  revalidatePath("/admin/expenses");
}

async function deleteExpense(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  if (!id) return;
  await prisma.expense.delete({ where: { id } });
  revalidatePath("/admin/expenses");
}

/* ── helpers ─────────────────────────────────────────────── */

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type SP = { month?: string; category?: string };

/* ── page ────────────────────────────────────────────────── */

export default async function ExpensesPage(props: { searchParams?: Promise<SP> }) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== "DIRECTOR") redirect("/admin");

  const sp = props.searchParams ? await props.searchParams : {};
  const month = sp.month || currentYYYYMM();
  const categoryFilter = sp.category || "";

  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);

  // All expenses for selected month
  const expenses = await prisma.expense.findMany({
    where: {
      date: { gte: monthStart, lt: monthEnd },
      ...(categoryFilter ? { category: categoryFilter } : {}),
    },
    orderBy: { date: "desc" },
  });

  // All existing categories (custom + default)
  const existingCategories = await prisma.expense.findMany({
    select: { category: true },
    distinct: ["category"],
  });
  const allCategories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...existingCategories.map((e) => e.category)])
  ).sort();

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // By category breakdown
  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">Director view · {month}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Expenses</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmt(totalExpenses)} UZS</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Transactions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{expenses.length}</p>
        </div>
      </div>

      {/* By category */}
      {Object.keys(byCategory).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">By Category</h2>
          <div className="space-y-2">
            {Object.entries(byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, total]) => {
                const pct = totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700">{cat}</span>
                      <span className="font-semibold text-gray-900">{fmt(total)} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <form method="get" className="flex flex-wrap gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Month</label>
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Category</label>
            <select
              name="category"
              defaultValue={categoryFilter}
              className="h-10 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All categories</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="self-end">
            <button type="submit" className="h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
              Apply
            </button>
          </div>
        </form>
      </div>

      {/* Add expense */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Add Expense</h2>
        <form action={createExpense} className="grid grid-cols-2 md:grid-cols-4 gap-3">

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Amount (UZS)</label>
            <input
              name="amount"
              type="number"
              min={0}
              step={1000}
              placeholder="500 000"
              required
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Category</label>
            <select
              name="category"
              required
              defaultValue=""
              className="w-full h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="" disabled>Select...</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__custom__">+ Custom category</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date</label>
            <input
              name="date"
              type="date"
              defaultValue={today}
              required
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
            <input
              name="description"
              placeholder="Optional note..."
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <button
            type="submit"
            className="col-span-2 md:col-span-4 h-11 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 transition"
          >
            Add Expense
          </button>
        </form>

        {/* Custom category note */}
        <p className="text-xs text-gray-400">
          Выбери "+ Custom category" и введи название вручную в поле Description — или добавь новую категорию через поле ниже.
        </p>

        {/* Quick add custom category */}
        <form action={createExpense} className="flex gap-3 pt-2 border-t border-gray-100">
          <input
            name="category"
            placeholder="New custom category name..."
            required
            className="flex-1 h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <input type="hidden" name="amount" value="0" />
          <input type="hidden" name="date" value={today} />
          <button
            type="submit"
            className="h-10 px-5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            + Add Category
          </button>
        </form>
      </div>

      {/* Expenses list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Transactions</h2>
          <span className="text-xs text-gray-400">{expenses.length} records · {fmt(totalExpenses)} UZS</span>
        </div>

        {expenses.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-400">No expenses for this period.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {expenses.map((e) => (
              <div key={e.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-50 text-red-600">
                      {e.category}
                    </span>
                    <span className="text-xs text-gray-400">{fmtDate(e.date)}</span>
                  </div>
                  {e.description && (
                    <p className="text-sm text-gray-600 mt-1 truncate">{e.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="font-bold text-gray-900">{fmt(e.amount)} UZS</span>
                  <form action={deleteExpense}>
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      className="h-8 px-3 rounded-lg bg-red-50 text-red-500 text-xs font-semibold hover:bg-red-100 transition"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}