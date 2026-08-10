"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

type Row = {
  id: string;
  name: string;
  group: string;
  total: number;
  present: number;
  absent: number;
  attendancePct: number | null;
  hwPct: number | null;
};

type Group = { id: string; name: string };

interface Props {
  rows: Row[];
  myGroups: Group[];
  period: "week" | "month" | "custom";
  groupIdFilter: string;
  month: string;
  dateFrom: string;
  dateTo: string;
  startKey: string;
  endKey: string;
}

function PctBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300 text-sm">—</span>;
  const color =
    value >= 80
      ? { bg: "#dcfce7", text: "#166534" }
      : value >= 60
      ? { bg: "#fef9c3", text: "#854d0e" }
      : { bg: "#fee2e2", text: "#991b1b" };
  return (
    <span style={{ background: color.bg, color: color.text, padding: "3px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700 }}>
      {value}%
    </span>
  );
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function pctAvg(rows: Row[], key: "attendancePct" | "hwPct") {
  const valid = rows.filter((r) => r[key] !== null);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((s, r) => s + (r[key] as number), 0) / valid.length);
}

export function ReportsClient({ rows, myGroups, period: initPeriod, groupIdFilter, month: initMonth, dateFrom: initFrom, dateTo: initTo, startKey, endKey }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [period, setPeriod] = useState(initPeriod);
  const [month, setMonth] = useState(initMonth);
  const [dateFrom, setDateFrom] = useState(initFrom);
  const [dateTo, setDateTo] = useState(initTo);
  const [groupId, setGroupId] = useState(groupIdFilter);

  function apply() {
    const params = new URLSearchParams();
    params.set("period", period);
    params.set("groupId", groupId);
    if (period === "month") params.set("month", month);
    if (period === "week") params.set("dateFrom", dateFrom);
    if (period === "custom") { params.set("dateFrom", dateFrom); params.set("dateTo", dateTo); }
    router.push(`${pathname}?${params.toString()}`);
  }

  const avgAttendance = pctAvg(rows, "attendancePct");
  const avgHw = pctAvg(rows, "hwPct");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Attendance & homework stats per student</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">

          {/* Period tabs */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Period</label>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden h-10">
              {(["week", "month", "custom"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className="px-4 text-sm font-medium transition"
                  style={period === p ? { background: "#111827", color: "#fff" } : { background: "#fff", color: "#6b7280" }}
                >
                  {p === "week" ? "Week" : p === "month" ? "Month" : "Custom"}
                </button>
              ))}
            </div>
          </div>

          {/* Month picker */}
          {period === "month" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Month</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}

          {/* Week picker */}
          {period === "week" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Week starting</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          )}

          {/* Custom range */}
          {period === "custom" && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </>
          )}

          {/* Group */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Group</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-10 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="">All groups</option>
              {myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <button
            type="button"
            onClick={apply}
            className="h-10 px-6 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition"
          >
            Apply
          </button>
        </div>

        <p className="text-xs text-gray-400">
          Showing: <span className="font-semibold text-gray-600">{fmtDate(startKey)} — {fmtDate(endKey)}</span>
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
          <p className="text-xs text-gray-400 mt-1 font-semibold uppercase tracking-wide">Students</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold" style={{ color: avgAttendance !== null && avgAttendance >= 80 ? "#166534" : avgAttendance !== null && avgAttendance >= 60 ? "#854d0e" : "#991b1b" }}>
            {avgAttendance !== null ? `${avgAttendance}%` : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1 font-semibold uppercase tracking-wide">Avg Attendance</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold" style={{ color: avgHw !== null && avgHw >= 80 ? "#166534" : avgHw !== null && avgHw >= 60 ? "#854d0e" : "#991b1b" }}>
            {avgHw !== null ? `${avgHw}%` : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1 font-semibold uppercase tracking-wide">Avg Homework</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "700px" }}>
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">Group</th>
                <th className="px-6 py-3 text-center">Lessons</th>
                <th className="px-6 py-3 text-center">Present</th>
                <th className="px-6 py-3 text-center">Absent</th>
                <th className="px-6 py-3 text-center">Attendance</th>
                <th className="px-6 py-3 text-center">Homework</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-gray-400">No reports found for this period.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-semibold text-gray-900">{row.name}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{row.group}</td>
                    <td className="px-6 py-3 text-center text-gray-600">{row.total || "—"}</td>
                    <td className="px-6 py-3 text-center">
                      {row.total > 0 ? <span className="text-green-600 font-semibold">{row.present}</span> : "—"}
                    </td>
                    <td className="px-6 py-3 text-center">
                      {row.total > 0 ? <span className={row.absent > 0 ? "text-red-500 font-semibold" : "text-gray-400"}>{row.absent}</span> : "—"}
                    </td>
                    <td className="px-6 py-3 text-center"><PctBadge value={row.attendancePct} /></td>
                    <td className="px-6 py-3 text-center"><PctBadge value={row.hwPct} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
            🟢 ≥80% · 🟡 60–79% · 🔴 &lt;60%
          </div>
        )}
      </div>
    </div>
  );
}