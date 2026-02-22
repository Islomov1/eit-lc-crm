import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { GroupStatus, ScheduleType, Prisma } from "@prisma/client";

function parseEnum<T extends Record<string, string>>(e: T, v?: string) {
  if (!v) return undefined;
  const values = Object.values(e) as string[];
  return values.includes(v) ? (v as T[keyof T]) : undefined;
}

type SP = Record<string, string | string[] | undefined>;

function spStr(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const q = (spStr(sp.q) ?? "").trim();
  const status = parseEnum(GroupStatus, spStr(sp.status));
  const schedule = parseEnum(ScheduleType, spStr(sp.schedule));


  const totalStudents = await prisma.student.count();
  const totalTeachers = await prisma.user.count({ where: { role: "TEACHER" } });
  const totalSupports = await prisma.user.count({ where: { role: "SUPPORT" } });
  const totalReports = await prisma.report.count();

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

const groups = await prisma.group.findMany({
  where,
  include: { teacher: true, students: true, program: true },
  orderBy: { createdAt: "desc" },
  take: 200,
});


  return (
    <div className="space-y-12">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-4 gap-8">
        <StatCard title="Students" value={totalStudents} />
        <StatCard title="Teachers" value={totalTeachers} />
        <StatCard title="Support Staff" value={totalSupports} />
        <StatCard title="Reports" value={totalReports} />
      </div>

      {/* ===== GROUPS LIST + SEARCH ===== */}
      <div className="bg-white p-8 rounded-2xl shadow-md space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Groups</h2>

          <form className="flex items-center gap-3">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search groups / teacher / program"
              className="border p-2 rounded w-80"
            />

            <select name="status" defaultValue={status ?? ""} className="border p-2 rounded">
              <option value="">All statuses</option>
              <option value="NEW">NEW</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="FINISHING">FINISHING</option>
              <option value="EXPIRED">EXPIRED</option>
            </select>

            <select name="schedule" defaultValue={schedule ?? ""} className="border p-2 rounded">
              <option value="">All schedules</option>
              <option value="MWF">MWF</option>
              <option value="TTS">TTS</option>
            </select>

            <button className="bg-black text-white px-6 py-2 rounded hover:opacity-80">
              Search
            </button>

            <Link href="/admin" className="text-sm text-gray-600 hover:underline">
              Reset
            </Link>
          </form>
        </div>

        {groups.length === 0 && <p className="text-gray-500">No groups found</p>}

        <div className="space-y-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className="border rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <p className="font-semibold text-lg">{group.name}</p>

                <p className="text-sm text-gray-500">
                  Teacher: {group.teacher ? group.teacher.name : "Not assigned"}
                </p>

                <p className="text-sm text-gray-500">Program: {group.program?.name ?? "-"}</p>
                <p className="text-sm text-gray-500">Students: {group.students.length}</p>
              </div>

              <div className="text-sm text-gray-500">
                {group.schedule} • {group.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-lg transition">
      <h3 className="text-gray-500 text-sm uppercase tracking-wide">{title}</h3>
      <p className="text-4xl font-bold mt-4 text-gray-900">{value}</p>
    </div>
  );
}
