import { prisma } from "@/src/lib/prisma";
import { revalidatePath } from "next/cache";

/* ================= CREATE GROUP ================= */

async function createGroup(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString();
  const schedule = formData.get("schedule")?.toString() as
    | "MWF"
    | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  const teacherId = formData.get("teacherId")?.toString();
  const programId = formData.get("programId")?.toString();
  const month = Number(formData.get("month"));

  if (!name || !schedule || !startTime || !endTime || !programId) return;

  await prisma.group.create({
    data: {
      name,
      schedule,
      startTime,
      endTime,
      teacherId: teacherId || null,
      programId,
      month: month || 1,
      status: "ACTIVE",
    },
  });

  revalidatePath("/admin/groups");
}

/* ================= PAGE ================= */

export default async function AdminDashboard() {
  const totalStudents = await prisma.student.count();

  const totalTeachers = await prisma.user.count({
    where: { role: "TEACHER" },
  });

  const totalSupports = await prisma.user.count({
    where: { role: "SUPPORT" },
  });

  const totalReports = await prisma.report.count();

const groups = await prisma.group.findMany({
  include: {
    teacher: true,
    students: true,
    program: true,
  },
  orderBy: { createdAt: "desc" },
});

  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER" },
  });

  return (
    <div className="space-y-12">

      <h1 className="text-3xl font-bold">
        Dashboard
      </h1>

      {/* ===== Stats ===== */}
      <div className="grid grid-cols-4 gap-8">
        <StatCard title="Students" value={totalStudents} />
        <StatCard title="Teachers" value={totalTeachers} />
        <StatCard title="Support Staff" value={totalSupports} />
        <StatCard title="Reports" value={totalReports} />
      </div>

      {/* ===== CREATE GROUP ===== */}
      <div className="bg-white p-8 rounded-2xl shadow-md">
        <h2 className="text-xl font-semibold mb-6">
          Create Group
        </h2>

        <form action={createGroup} className="flex gap-4">
          <input
            name="name"
            placeholder="Group name"
            required
            className="border p-2 rounded w-64"
          />

          <select
            name="teacherId"
            className="border p-2 rounded"
          >
            <option value="">No teacher</option>
            {teachers.map((teacher) => (
              <option
                key={teacher.id}
                value={teacher.id}
              >
                {teacher.name}
              </option>
            ))}
          </select>

          <button className="bg-black text-white px-6 rounded hover:opacity-80">
            Add Group
          </button>
        </form>
      </div>

      {/* ===== GROUPS LIST ===== */}
      <div className="bg-white p-8 rounded-2xl shadow-md">
        <h2 className="text-xl font-semibold mb-6">
          Groups
        </h2>

        {groups.length === 0 && (
          <p className="text-gray-500">
            No groups created yet
          </p>
        )}

        <div className="space-y-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className="border rounded-xl p-4 flex justify-between items-center"
            >
              <div>
                <p className="font-semibold text-lg">
                  {group.name}
                </p>

                <p className="text-sm text-gray-500">
                  Teacher:{" "}
                  {group.teacher
                    ? group.teacher.name
                    : "Not assigned"}
                </p>

                <p className="text-sm text-gray-500">
                  Students: {group.students.length}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

/* ================= CARD ================= */

function StatCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="bg-white p-8 rounded-2xl shadow-md hover:shadow-lg transition">
      <h3 className="text-gray-500 text-sm uppercase tracking-wide">
        {title}
      </h3>

      <p className="text-4xl font-bold mt-4 text-gray-900">
        {value}
      </p>
      </div>
  );
}