import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) redirect("/login");

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!currentUser || currentUser.role !== "ADMIN") {
    redirect("/");
  }

  const now = new Date();

  const selectedMonth = searchParams.month
    ? new Date(searchParams.month)
    : new Date(now.getFullYear(), now.getMonth(), 1);

  const startOfMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth(),
    1
  );

  const endOfMonth = new Date(
    selectedMonth.getFullYear(),
    selectedMonth.getMonth() + 1,
    1
  );

  const students = await prisma.student.findMany({
    include: {
      reports: {
        where: {
          date: {
            gte: startOfMonth,
            lt: endOfMonth,
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="min-h-screen bg-gray-100 p-10 space-y-8">

      <h1 className="text-2xl font-bold">
        Student Attendance Report
      </h1>

      {/* Month Filter */}
      <form className="bg-white p-4 rounded-xl shadow w-fit">
        <input
          type="month"
          name="month"
          defaultValue={`${startOfMonth.getFullYear()}-${String(
            startOfMonth.getMonth() + 1
          ).padStart(2, "0")}`}
          className="border p-2 rounded"
        />
        <button
          type="submit"
          className="ml-3 bg-black text-white px-4 py-2 rounded"
        >
          Filter
        </button>
      </form>
      <a
  href={`/api/admin/send-attendance-warning?month=${startOfMonth.toISOString()}`}
  className="bg-red-600 text-white px-4 py-2 rounded-lg inline-block mt-4"
>
  Send Low Attendance Warnings
</a>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-3">Student</th>
              <th>Total Lessons</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Attendance %</th>
            </tr>
          </thead>

          <tbody>
            {students.map((student) => {
              const total = student.reports.length;
              const present = student.reports.filter(
                (r) => r.attendance === "PRESENT"
              ).length;
              const absent = total - present;

              const percent =
                total > 0
                  ? ((present / total) * 100).toFixed(1)
                  : "0";

              return (
                <tr
                  key={student.id}
                  className="border-b"
                >
                  <td className="py-3 font-medium">
                    {student.name}
                  </td>
                  <td>{total}</td>
                  <td className="text-green-600">
                    {present}
                  </td>
                  <td className="text-red-600">
                    {absent}
                  </td>
                  <td className="font-semibold">
                    {percent}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}