import { prisma } from "@/src/lib/prisma";

export default async function AdminDashboard() {
  const totalStudents = await prisma.student.count();

  const totalTeachers = await prisma.user.count({
    where: { role: "TEACHER" },
  });

  const totalSupports = await prisma.user.count({
    where: { role: "SUPPORT" },
  });

  const totalReports = await prisma.report.count();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-10">
        Dashboard
      </h1>

      <div className="grid grid-cols-4 gap-8">

        <StatCard
          title="Students"
          value={totalStudents}
        />

        <StatCard
          title="Teachers"
          value={totalTeachers}
        />

        <StatCard
          title="Support Staff"
          value={totalSupports}
        />

        <StatCard
          title="Reports"
          value={totalReports}
        />

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