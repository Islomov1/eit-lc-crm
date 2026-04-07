import { prisma } from "@/lib/prisma";
import { GroupStatus } from "@prisma/client";
import Link from "next/link";

export const revalidate = 30;

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  FINISHING: "bg-orange-100 text-orange-700",
  EXPIRED: "bg-red-100 text-red-700",
};

type SP = Record<string, string | string[] | undefined>;

export default async function TimetablePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  const programFilter = typeof sp.programId === "string" ? sp.programId : undefined;
  const teacherFilter = typeof sp.teacherId === "string" ? sp.teacherId : undefined;
  const statusFilter =
    typeof sp.status === "string" &&
    (Object.values(GroupStatus) as string[]).includes(sp.status)
      ? (sp.status as GroupStatus)
      : undefined;

  // ✅ Параллельные запросы
  const [groups, programs, teachers] = await Promise.all([
    prisma.group.findMany({
      where: {
        ...(programFilter ? { programId: programFilter } : {}),
        ...(teacherFilter ? { teacherId: teacherFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: { teacher: true, program: true, students: true },
      orderBy: [{ schedule: "asc" }, { startTime: "asc" }],
      take: 300,
    }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "TEACHER" }, orderBy: { name: "asc" } }),
  ]);

  const mwfGroups = groups.filter((g) => g.schedule === "MWF");
  const ttsGroups = groups.filter((g) => g.schedule === "TTS");

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Timetable
          <span className="ml-2 text-base font-normal text-gray-400">{groups.length} groups</span>
        </h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <form method="GET" className="flex flex-wrap gap-3">
          <select
            name="programId"
            defaultValue={programFilter ?? ""}
            className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">All Programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select
            name="teacherId"
            defaultValue={teacherFilter ?? ""}
            className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">All Teachers</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <select
            name="status"
            defaultValue={statusFilter ?? ""}
            className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">All Status</option>
            <option value="NEW">NEW</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="FINISHING">FINISHING</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>

          <button
            type="submit"
            className="h-11 px-6 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition"
          >
            Apply
          </button>

          <Link
            href="/admin/timetable"
            className="h-11 px-6 flex items-center rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
          >
            Reset
          </Link>
        </form>
      </div>

      {groups.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
          No groups found.
        </div>
      )}

      {/* MWF */}
      {mwfGroups.length > 0 && (
        <Section title="Mon · Wed · Fri" count={mwfGroups.length} groups={mwfGroups} />
      )}

      {/* TTS */}
      {ttsGroups.length > 0 && (
        <Section title="Tue · Thu · Sat" count={ttsGroups.length} groups={ttsGroups} />
      )}
    </div>
  );
}

type Group = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  month: number;
  status: GroupStatus;
  schedule: string;
  program: { name: string } | null;
  teacher: { name: string } | null;
  students: { id: string }[];
};

function Section({ title, count, groups }: { title: string; count: number; groups: Group[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-900">
          {title}
          <span className="ml-2 text-sm font-normal text-gray-400">{count} groups</span>
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100">
            <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-6 py-3">Group</th>
              <th className="px-6 py-3">Program</th>
              <th className="px-6 py-3">Time</th>
              <th className="px-6 py-3">Teacher</th>
              <th className="px-6 py-3">Students</th>
              <th className="px-6 py-3">Month</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {groups.map((group) => (
              <tr key={group.id} className="hover:bg-gray-50 transition">
                <td className="px-6 py-3 font-semibold text-gray-900">{group.name}</td>
                <td className="px-6 py-3 text-gray-600">{group.program?.name ?? "—"}</td>
                <td className="px-6 py-3 text-gray-600 font-mono text-xs">
                  {group.startTime} – {group.endTime}
                </td>
                <td className="px-6 py-3 text-gray-600">{group.teacher?.name ?? "Not assigned"}</td>
                <td className="px-6 py-3 text-gray-600">{group.students.length}</td>
                <td className="px-6 py-3 text-gray-600">Month {group.month}</td>
                <td className="px-6 py-3">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLES[group.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {group.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


