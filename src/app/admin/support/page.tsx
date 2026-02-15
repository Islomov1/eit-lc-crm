import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function AdminSupportPage({
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

  const supports = await prisma.user.findMany({
    where: { role: "SUPPORT" },
    include: {
      supportSessions: {
        where: {
          startTime: {
            gte: startOfMonth,
            lt: endOfMonth,
          },
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-gray-100 p-10 space-y-8">

      <h1 className="text-2xl font-bold">
        Support Monthly Report
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
  href={`/api/admin/support-export?month=${startOfMonth.toISOString()}`}
  className="bg-green-600 text-white px-4 py-2 rounded-lg inline-block"
>
  Export Excel
</a>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-3">Name</th>
              <th>Email</th>
              <th>Sessions</th>
              <th>Total Hours</th>
            </tr>
          </thead>

          <tbody>
            {supports.map((support) => {
              const totalHours =
                support.supportSessions.reduce(
                  (sum, session) =>
                    sum +
                    (session.endTime.getTime() -
                      session.startTime.getTime()) /
                      (1000 * 60 * 60),
                  0
                );

              return (
                <tr
                  key={support.id}
                  className="border-b"
                >
                  <td className="py-3 font-medium">
                    {support.name}
                  </td>
                  <td>{support.email}</td>
                  <td>
                    {support.supportSessions.length}
                  </td>
                  <td>
                    {totalHours.toFixed(2)} h
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