import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { GroupStatus, ScheduleType, Prisma } from "@prisma/client";

// Убрали force-dynamic — используем staleTimes из next.config.ts
export const revalidate = 30; // обновляем каждые 30 сек

function parseEnum<T extends Record<string, string>>(e: T, v?: string) {
  if (!v) return undefined;
  return Object.values(e).includes(v) ? (v as T[keyof T]) : undefined;
}



function spStr(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

type SP = Record<string, string | string[] | undefined>;

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const q = (spStr(sp.q) ?? "").trim();
  const status = parseEnum(GroupStatus, spStr(sp.status));
  const schedule = parseEnum(ScheduleType, spStr(sp.schedule));

  const where: Prisma.GroupWhereInput = {
    ...(status ? { status } : {}),
    ...(schedule ? { schedule } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { teacher: { is: { name: { contains: q, mode: "insensitive" } } } },
            { program: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  // ✅ Все запросы параллельно — не ждём друг друга
  const [totalStudents, totalTeachers, totalSupports, totalReports, groups] =
    await Promise.all([
      prisma.student.count(),
      prisma.user.count({ where: { role: "TEACHER" } }),
      prisma.user.count({ where: { role: "SUPPORT" } }),
      prisma.report.count(),
      prisma.group.findMany({
        where,
        include: { teacher: true, students: true, program: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

  return (
    <div className="space-y-10 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Students" value={totalStudents} />
        <StatCard title="Teachers" value={totalTeachers} />
        <StatCard title="Support Staff" value={totalSupports} />
        <StatCard title="Reports" value={totalReports} />
      </div>

      {/* Groups */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-4">
          <h2 className="font-semibold text-gray-900">
            Groups
            <span className="ml-2 text-sm font-normal text-gray-400">
              {groups.length} found
            </span>
          </h2>

          <form className="flex items-center gap-3 flex-wrap">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search groups / teacher / program"
              className="h-10 border border-gray-200 rounded-xl px-4 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All statuses</option>
              <option value="NEW">NEW</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="FINISHING">FINISHING</option>
              <option value="EXPIRED">EXPIRED</option>
            </select>
            <select
              name="schedule"
              defaultValue={schedule ?? ""}
              className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All schedules</option>
              <option value="MWF">MWF</option>
              <option value="TTS">TTS</option>
            </select>
            <button className="h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
              Search
            </button>
            <Link
              href="/admin"
              className="h-10 px-4 border border-gray-200 rounded-xl text-sm text-gray-600 flex items-center hover:bg-gray-50 transition"
            >
              Reset
            </Link>
          </form>
        </div>

        {groups.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-400">No groups found.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {groups.map((group) => (
              <div
                key={group.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition"
              >
                <div>
                  <p className="font-semibold text-gray-900">{group.name}</p>
                  <p className="text-sm text-gray-500">
                    {group.teacher?.name ?? "No teacher"} · {group.program?.name ?? "—"} · {group.students.length} students
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={group.status} />
                  <span className="text-xs text-gray-400">{group.schedule}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  FINISHING: "bg-yellow-100 text-yellow-700",
  EXPIRED: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}