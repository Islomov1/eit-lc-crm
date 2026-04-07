import Link from "next/link";
import { getTeachers, getTeacherSheet, saveStudentPayment, deletePayment, sendPaymentReminders } from "./actions";

/* ── helpers ─────────────────────────────────────────────── */
function calcFinalAmount(base: number, discountPct: number, bonus: number): number {
  const discounted = Math.round(base * (1 - Math.min(Math.max(discountPct, 0), 100) / 100));
  return Math.max(0, discounted + bonus);
}
function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtDate(d: Date | null) {
  if (!d) return "—";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(n);
}

type SP = { teacherId?: string; month?: string; q?: string };

/* ── page ────────────────────────────────────────────────── */

export default async function PaymentsPage(props: { searchParams?: Promise<SP> }) {
  const sp = (props.searchParams ? await props.searchParams : {}) as SP;

  const teachers = await getTeachers();
  const teacherId = sp.teacherId || teachers[0]?.id || "";
  const month = sp.month || currentYYYYMM();
  const q = (sp.q || "").trim();

  const sheet = teacherId ? await getTeacherSheet({ teacherId, month, q }) : null;

  const paidCount = sheet?.rows.filter((r) => r.paid).length ?? 0;
  const unpaidCount = sheet ? sheet.rows.length - paidCount : 0;
  const totalRevenue = sheet?.rows.reduce((s, r) => s + (r.paid ? r.amount : 0), 0) ?? 0;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <Link
          href={`/admin/payments/export?month=${encodeURIComponent(month)}`}
          className="h-10 px-5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition"
        >
          ↓ Export
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <form method="get" className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Teacher</label>
            <select
              name="teacherId"
              defaultValue={teacherId}
              className="h-10 w-full rounded-xl border border-gray-200 px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1 w-[160px]">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Month</label>
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="space-y-1 flex-1 min-w-[160px]">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Student name..."
              className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="flex gap-2 self-end">
            <button type="submit" className="h-10 px-5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition">
              Apply
            </button>
            <Link href="/admin/payments" className="h-10 px-4 rounded-xl border border-gray-200 flex items-center text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
              Reset
            </Link>
          </div>
        </form>
      </div>

      {/* Summary cards */}
      {sheet && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{sheet.rows.length}</p>
          </div>
          <div className="bg-green-50 rounded-2xl border border-green-100 p-5">
            <p className="text-xs font-semibold text-green-500 uppercase tracking-wide">Paid · {fmt(totalRevenue)} UZS</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{paidCount}</p>
          </div>
          <div className={`rounded-2xl border p-5 ${unpaidCount > 0 ? "bg-red-50 border-red-100" : "bg-gray-50 border-gray-100"}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${unpaidCount > 0 ? "text-red-500" : "text-gray-400"}`}>Unpaid</p>
            <p className={`text-2xl font-bold mt-1 ${unpaidCount > 0 ? "text-red-700" : "text-gray-500"}`}>{unpaidCount}</p>
          </div>
        </div>
      )}

      {/* Reminder banner */}
      {sheet && unpaidCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold text-amber-900 text-sm">
              {unpaidCount} student{unpaidCount !== 1 ? "s" : ""} have not paid for {month}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Send Telegram reminder to all linked parents
            </p>
          </div>
          <form action={sendPaymentReminders}>
            <input type="hidden" name="month" value={month} />
           <button
  type="submit"
  style={{ background: "#f59e0b", color: "white", height: "36px", padding: "0 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
>
  📩 Send Reminders
</button>
          </form>
        </div>
      )}

      {/* Table */}
      {!sheet ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-500">
          No teacher selected.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="font-semibold text-gray-900 text-sm">{sheet.teacher.name}</span>
              <span className="text-gray-400 mx-2">·</span>
              <span className="text-gray-600 text-sm">{month}</span>
            </div>
            <div className="text-sm font-semibold text-gray-900">
              Revenue: <span className="text-green-600">{fmt(totalRevenue)} UZS</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "1000px" }}>
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3" style={{ width: "160px" }}>Student</th>
                  <th className="px-4 py-3" style={{ width: "130px" }}>Group</th>
                  <th className="px-4 py-3" style={{ width: "70px" }}>Paid</th>
                  <th className="px-4 py-3" style={{ width: "110px" }}>Base</th>
                  <th className="px-4 py-3" style={{ width: "90px" }}>Disc %</th>
                  <th className="px-4 py-3" style={{ width: "100px" }}>Bonus</th>
                  <th className="px-4 py-3" style={{ width: "110px" }}>Final</th>
                  <th className="px-4 py-3" style={{ width: "100px" }}>Status</th>
                  <th className="px-4 py-3" style={{ width: "100px" }}>Method</th>
                  <th className="px-4 py-3" style={{ width: "150px" }}>Note</th>
                  <th className="px-4 py-3 text-right" style={{ width: "130px" }}>Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {sheet.rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-gray-400 text-sm">No students found.</td>
                  </tr>
                ) : (
                  sheet.rows.map((r) => (
                    <tr key={r.studentId} className={`align-middle hover:bg-gray-50 ${!r.paid ? "bg-red-50/20" : ""}`}>

                      <td className="px-4 py-2">
                        <span className="font-medium text-gray-900 text-xs leading-tight block truncate">{r.studentName}</span>
                      </td>

                      <td className="px-4 py-2">
                        <span className="text-gray-600 text-xs truncate block">{r.groupName}</span>
                      </td>

                      <td className="px-4 py-2">
                        {r.paid ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">✓</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">✗</span>
                        )}
                      </td>

                      <td className="px-4 py-2">
                        <input
                          form={`pay-${r.studentId}`}
                          name="baseAmount"
                          type="number"
                          min={0}
                          step={1000}
                          defaultValue={r.baseAmount}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-right text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                      </td>

                      <td className="px-4 py-2">
                        <div className="relative">
                          <input
                            form={`pay-${r.studentId}`}
                            name="discountPct"
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            defaultValue={r.discountPct}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 pr-5 text-right text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                        </div>
                      </td>

                      <td className="px-4 py-2">
                        <input
                          form={`pay-${r.studentId}`}
                          name="bonus"
                          type="number"
                          min={0}
                          step={1000}
                          defaultValue={r.bonus}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-right text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                      </td>

                      <td className="px-4 py-2">
                        <div className="text-right font-bold text-gray-900 text-xs">
                          {fmt(r.amount || calcFinalAmount(r.baseAmount, r.discountPct, r.bonus))}
                        </div>
                        {r.paidAt && (
                          <div className="text-xs text-gray-400 text-right">{fmtDate(r.paidAt)}</div>
                        )}
                      </td>

                      <td className="px-4 py-2">
                        <select
                          form={`pay-${r.studentId}`}
                          name="status"
                          defaultValue={String(r.status)}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                          <option value="PAID">PAID</option>
                          <option value="PARTIAL">PARTIAL</option>
                          <option value="REFUND">REFUND</option>
                          <option value="VOID">VOID</option>
                        </select>
                      </td>

                      <td className="px-4 py-2">
                        <select
                          form={`pay-${r.studentId}`}
                          name="method"
                          defaultValue={String(r.method)}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
                        >
                          <option value="CASH">CASH</option>
                          <option value="CARD">CARD</option>
                          <option value="TRANSFER">TRANSFER</option>
                          <option value="CLICK">CLICK</option>
                          <option value="PAYME">PAYME</option>
                          <option value="OTHER">OTHER</option>
                        </select>
                      </td>

                      <td className="px-4 py-2">
                        <input
                          form={`pay-${r.studentId}`}
                          name="note"
                          defaultValue={r.note}
                          placeholder="Note..."
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                      </td>

                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1.5">
                          <form id={`pay-${r.studentId}`} action={saveStudentPayment}>
                            <input type="hidden" name="teacherId" value={teacherId} />
                            <input type="hidden" name="studentId" value={r.studentId} />
                            <input type="hidden" name="month" value={month} />
                            <button
                              type="submit"
                              className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition whitespace-nowrap"
                            >
                              Save
                            </button>
                          </form>

                          <form action={deletePayment}>
                            <input type="hidden" name="id" value={r.paymentId ?? ""} />
                            <button
                              type="submit"
                              disabled={!r.paymentId}
                              className={`h-8 px-3 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                                r.paymentId
                                  ? "bg-red-100 text-red-600 hover:bg-red-200"
                                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
                              }`}
                            >
                              Del
                            </button>
                          </form>
                        </div>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Final = Base × (1 − Discount%) + Bonus
            </p>
          </div>
        </div>
      )}
    </div>
  );
}