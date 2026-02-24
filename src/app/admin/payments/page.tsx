// src/app/admin/payments/page.tsx
import Link from "next/link";
import { getTeachers, getTeacherSheet, saveStudentPayment, deletePayment } from "./actions";

function currentYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function fmtDate(d: Date | null) {
  if (!d) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type SP = { teacherId?: string; month?: string; q?: string };

export default async function PaymentsPage(props: { searchParams?: Promise<SP> }) {
  const sp = (props.searchParams ? await props.searchParams : {}) as SP;

  const teachers = await getTeachers();
  const teacherId = sp.teacherId || teachers[0]?.id || "";
  const month = sp.month || currentYYYYMM();
  const q = (sp.q || "").trim();

  const sheet = teacherId ? await getTeacherSheet({ teacherId, month, q }) : null;

  const printHref = `/admin/payments/export?month=${encodeURIComponent(month)}`;

  return (
    <div className="max-w-[1400px] mx-auto px-6 space-y-8">
      <h1 className="text-2xl font-bold">Payments</h1>

      {/* FILTERS */}
      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Filters</h2>
          {sheet ? (
            <div className="text-sm text-gray-600">
              Showing <span className="font-semibold text-gray-900">{sheet.rows.length}</span>{" "}
              student{sheet.rows.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>

        <form method="get" className="grid grid-cols-12 gap-6 items-end">
          {/* Teacher */}
          <div className="col-span-12 lg:col-span-4 space-y-2">
            <label className="text-sm font-medium text-gray-600">Teacher</label>
            <select
              name="teacherId"
              defaultValue={teacherId}
              className="h-11 w-full rounded-xl border border-gray-200 px-4 bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
              required
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Month */}
          <div className="col-span-12 lg:col-span-3 space-y-2">
            <label className="text-sm font-medium text-gray-600">Month (YYYY-MM)</label>
            <input
              name="month"
              defaultValue={month}
              className="h-11 w-full rounded-xl border border-gray-200 px-4 focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>

          {/* Student */}
          <div className="col-span-12 lg:col-span-3 space-y-2">
            <label className="text-sm font-medium text-gray-600">Student name</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search student..."
              className="h-11 w-full rounded-xl border border-gray-200 px-4 focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>

          {/* Buttons + Download */}
          <div className="col-span-12 lg:col-span-2 grid grid-cols-2 gap-3">
            <button
              type="submit"
              className="h-11 w-full rounded-xl bg-black text-white font-semibold hover:opacity-85 active:scale-[0.99] transition"
            >
              Apply
            </button>

            <Link
              href="/admin/payments"
              className="h-11 w-full rounded-xl border border-gray-200 flex items-center justify-center font-semibold text-gray-700 hover:bg-black hover:text-white transition"
            >
              Reset
            </Link>

            {printHref ? (
              <Link
                href={printHref}
                className="h-11 w-full col-span-2 rounded-xl bg-green-600 text-white font-semibold hover:opacity-85 active:scale-[0.99] transition flex items-center justify-center"
              >
                Download printable table
              </Link>
            ) : null}
          </div>
        </form>

        <div className="text-xs text-gray-500 pt-2 text-right">
          Tip: leave Student name empty to see all students.
        </div>
      </div>

      {!sheet ? (
        <div className="bg-white p-6 rounded-2xl shadow">No teacher selected.</div>
      ) : (
        <div className="bg-white p-6 rounded-2xl shadow space-y-4">
          <div className="text-sm text-gray-700">
            Teacher: <span className="font-semibold">{sheet.teacher.name}</span>
            <span className="text-gray-400"> • </span>
            Month: <span className="font-semibold">{month}</span>
          </div>

          {/* TABLE */}
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="min-w-[1100px] w-full table-fixed">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  <th className="p-4 w-[260px]">Student</th>
                  <th className="p-4 w-[200px]">Group</th>
                  <th className="p-4 w-[120px]">Paid</th>
                  <th className="p-4 w-[140px] text-right">Amount</th>
                  <th className="p-4 w-[140px]">Status</th>
                  <th className="p-4 w-[140px]">Method</th>
                  <th className="p-4 w-[140px]">Paid date</th>
                <th className="p-4 w-[220px] text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {sheet.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-sm text-gray-500">
                      No students found for this teacher (or your search is too strict).
                    </td>
                  </tr>
                ) : (
                  sheet.rows.map((r) => (
                    <tr key={r.studentId} className="align-middle">
                      <td className="p-4">
                        <div className="font-semibold text-gray-900 truncate">{r.studentName}</div>
                      </td>

                      <td className="p-4">
                        <div className="text-gray-700 truncate">{r.groupName}</div>
                      </td>

                      <td className="p-4">
                        {r.paid ? (
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
                            PAID
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-semibold">
                            NOT PAID
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <input
                          form={`pay-${r.studentId}`}
                          name="amount"
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={r.amount}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </td>

                      <td className="p-4">
                        <select
                          form={`pay-${r.studentId}`}
                          name="status"
                          defaultValue={String(r.status)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
                        >
                          <option value="PAID">PAID</option>
                          <option value="PARTIAL">PARTIAL</option>
                          <option value="REFUND">REFUND</option>
                          <option value="VOID">VOID</option>
                        </select>
                      </td>

                      <td className="p-4">
                        <select
                          form={`pay-${r.studentId}`}
                          name="method"
                          defaultValue={String(r.method)}
                          className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-200"
                        >
                          <option value="CASH">CASH</option>
                          <option value="CARD">CARD</option>
                          <option value="TRANSFER">TRANSFER</option>
                          <option value="CLICK">CLICK</option>
                          <option value="PAYME">PAYME</option>
                          <option value="OTHER">OTHER</option>
                        </select>
                      </td>

                      <td className="p-4">
                        <div className="text-gray-800">{fmtDate(r.paidAt)}</div>
                        <div className="text-[11px] text-gray-400">Auto on save</div>
                      </td>

                     <td className="p-4">
  <div className="flex justify-end gap-3">
    <form id={`pay-${r.studentId}`} action={saveStudentPayment} className="w-[110px]">
      <input type="hidden" name="teacherId" value={teacherId} />
      <input type="hidden" name="studentId" value={r.studentId} />
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        className="inline-flex items-center justify-center w-full rounded-xl bg-blue-600 text-white px-4 py-2 font-semibold hover:bg-blue-700 active:scale-[0.99] transition"
      >
        Save
      </button>
    </form>

    <form action={deletePayment} className="w-[110px]">
      <input type="hidden" name="id" value={r.paymentId ?? ""} />
      <button
        type="submit"
        disabled={!r.paymentId}
        className={`inline-flex items-center justify-center w-full rounded-xl px-4 py-2 font-semibold active:scale-[0.99] transition ${
          r.paymentId
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-gray-100 text-gray-400 cursor-not-allowed"
        }`}
      >
        Delete
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

          <div className="text-xs text-gray-500">
            If the table is too wide, scroll horizontally inside the table box (not the whole page).
          </div>
        </div>
      )}
    </div>
  );
}