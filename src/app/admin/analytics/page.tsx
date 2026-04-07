import { getAnalyticsData } from "./actions";

/* ── helpers ─────────────────────────────────────────────── */
function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type SP = { month?: string; year?: string };

/* ── page ────────────────────────────────────────────────── */
export default async function AnalyticsPage(props: { searchParams?: Promise<SP> }) {
  const sp = props.searchParams ? await props.searchParams : {};
  const month = (sp.month as string) || currentYYYYMM();
  const year = Number(sp.year) || new Date().getFullYear();

  const data = await getAnalyticsData(month, year);

  const maxRevenue = Math.max(...data.monthlyRevenue.map((r) => r.amount), 1);

  return (
    <div className="space-y-10 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Month: <strong>{month}</strong> · Year: <strong>{year}</strong>
          </p>
        </div>

        <form method="get" className="flex items-center gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 block">Month</label>
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 block">Year</label>
            <select
              name="year"
              defaultValue={year}
              className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="self-end">
            <button className="h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
              Apply
            </button>
          </div>
        </form>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Active Students" value={String(data.summary.totalStudents)} />
        <SummaryCard label="Active Groups" value={String(data.summary.totalGroups)} />
        <SummaryCard
          label="Month Revenue"
          value={`${fmt(data.summary.monthRevenue)} UZS`}
          highlight
        />
        <SummaryCard
          label={`${year} Total`}
          value={`${fmt(data.summary.yearRevenue)} UZS`}
          highlight
        />
        <SummaryCard
          label="Unpaid This Month"
          value={String(data.summary.unpaidCount)}
          danger={data.summary.unpaidCount > 0}
        />
      </div>

      {/* ── Row 1: Attendance + Teacher KPI ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Attendance by group */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Attendance by Group</h2>
          <p className="text-xs text-gray-400">Selected month · % present</p>

          {data.attendanceByGroup.length === 0 ? (
            <p className="text-sm text-gray-400">No reports for this month.</p>
          ) : (
            <div className="space-y-3">
              {data.attendanceByGroup
                .sort((a, b) => b.rate - a.rate)
                .map((g) => (
                  <div key={g.name} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-800 truncate max-w-[200px]">{g.name}</span>
                      <span className={`font-bold ${g.rate >= 80 ? "text-green-600" : g.rate >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                        {g.rate}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${g.rate >= 80 ? "bg-green-500" : g.rate >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
                        style={{ width: `${g.rate}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      {g.present} present · {g.absent} absent
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Teacher KPI */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Teacher KPI</h2>
          <p className="text-xs text-gray-400">Reports submitted · attendance & homework rates</p>

          {data.teacherKpi.length === 0 ? (
            <p className="text-sm text-gray-400">No teachers found.</p>
          ) : (
            <div className="space-y-4">
              {data.teacherKpi
                .sort((a, b) => b.totalReports - a.totalReports)
                .map((t) => (
                  <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {t.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.totalReports} reports submitted</p>
                      <div className="flex gap-4 mt-2">
                        <div>
                          <p className="text-xs text-gray-400">Attendance</p>
                          <p className={`text-sm font-bold ${t.attendanceRate >= 80 ? "text-green-600" : t.attendanceRate >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                            {t.attendanceRate}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Homework done</p>
                          <p className={`text-sm font-bold ${t.hwDoneRate >= 80 ? "text-green-600" : t.hwDoneRate >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                            {t.hwDoneRate}%
                          </p>
                        </div>
                      </div>
                    </div>
                    {t.totalReports === 0 && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-semibold flex-shrink-0">
                        No reports
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Revenue by Month (Year) ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Revenue {year}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Monthly income · PAID + PARTIAL payments</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Year Total</p>
            <p className="text-lg font-bold text-gray-900">{fmt(data.summary.yearRevenue)} UZS</p>
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-2 h-40 pt-4">
          {data.monthlyRevenue.map((r) => {
            const heightPct = maxRevenue > 0 ? (r.amount / maxRevenue) * 100 : 0;
            const isCurrentMonth = r.month === new Date(year, new Date().getMonth(), 1).toLocaleString("en", { month: "short" });
            return (
              <div key={r.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium truncate">
                  {fmt(r.amount) !== "0" ? fmt(r.amount) : ""}
                </p>
                <div className="w-full flex items-end" style={{ height: "80px" }}>
                  <div
                    className={`w-full rounded-t-lg transition-all ${isCurrentMonth ? "bg-gray-900" : "bg-gray-200"}`}
                    style={{ height: `${Math.max(heightPct, r.amount > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400">{r.month}</p>
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</th>
                <th className="pb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Revenue (UZS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.monthlyRevenue.map((r) => (
                <tr key={r.month} className="hover:bg-gray-50">
                  <td className="py-2 font-medium text-gray-800">{r.month} {year}</td>
                  <td className="py-2 text-right font-semibold text-gray-900">{fmt(r.amount)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200">
                <td className="py-3 font-bold text-gray-900">Total {year}</td>
                <td className="py-3 text-right font-bold text-gray-900 text-base">{fmt(data.summary.yearRevenue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Unpaid Students ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Unpaid Students</h2>
            <p className="text-xs text-gray-400 mt-0.5">Active students with no payment recorded for {month}</p>
          </div>
          <span className={`text-sm font-bold px-3 py-1 rounded-full ${data.unpaidStudents.length > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {data.unpaidStudents.length === 0 ? "All paid ✓" : `${data.unpaidStudents.length} unpaid`}
          </span>
        </div>

        {data.unpaidStudents.length === 0 ? (
          <div className="p-6 text-sm text-gray-400">Everyone has paid this month. 🎉</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Group</th>
                  <th className="px-6 py-3">Teacher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.unpaidStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-red-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-6 py-3 text-gray-600">{s.group}</td>
                    <td className="px-6 py-3 text-gray-600">{s.teacher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */
function SummaryCard({
  label,
  value,
  highlight,
  danger,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${
      danger
        ? "bg-red-50 border-red-100"
        : highlight
        ? "bg-gray-900 border-gray-900 text-white"
        : "bg-white border-gray-100 shadow-sm"
    }`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${
        danger ? "text-red-500" : highlight ? "text-gray-400" : "text-gray-500"
      }`}>
        {label}
      </p>
      <p className={`text-xl font-bold mt-2 leading-tight ${
        danger ? "text-red-700" : highlight ? "text-white" : "text-gray-900"
      }`}>
        {value}
      </p>
    </div>
  );
}