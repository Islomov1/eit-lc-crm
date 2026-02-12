import { prisma } from "@/src/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AttendanceStatus, HomeworkStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

async function updateReport(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  const attendance = formData.get("attendance")?.toString();
  const homework = formData.get("homework")?.toString();
  const comment = formData.get("comment")?.toString();

  if (!id || !attendance || !homework) return;

  await prisma.report.update({
    where: { id },
    data: {
     attendance: attendance as AttendanceStatus,
homework: homework as HomeworkStatus,
      comment,
    },
  });

  revalidatePath("/admin/students");
}

export default async function StudentPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  if (!params?.id) {
  redirect("/admin/students");
}

  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) redirect("/login");

  const admin = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!admin || admin.role !== "ADMIN") {
    redirect("/");
  }

  const student = await prisma.student.findUnique({
    where: { id: params.id },
    include: {
      group: true,
      parents: true,
      reports: {
        include: {
          teacher: true,
        },
        orderBy: {
          date: "desc",
        },
      },
      supportSessions: {
        include: {
          support: true,
        },
        orderBy: {
          startTime: "desc",
        },
      },
    },
  });

  if (!student) return <div>Student not found</div>;

  const totalReports = student.reports.length;
  const presentCount = student.reports.filter(
    (r) => r.attendance === "PRESENT"
  ).length;

  const attendancePercent =
    totalReports > 0
      ? ((presentCount / totalReports) * 100).toFixed(1)
      : "0";

  return (
    <div className="min-h-screen bg-gray-100 p-10 space-y-8">

      {/* Basic Info */}
      <div className="bg-white p-6 rounded-2xl shadow">
        <h1 className="text-2xl font-bold mb-2">
          {student.name}
        </h1>
        <p className="text-gray-600">
          Group: {student.group?.name || "Not assigned"}
        </p>
        <p className="text-gray-600">
          Attendance: {attendancePercent}%
        </p>
      </div>

      {/* Parents */}
      <div className="bg-white p-6 rounded-2xl shadow">
        <h2 className="font-semibold mb-4">
          Parents
        </h2>

        {student.parents.length === 0 && (
          <p>No parents added</p>
        )}

        {student.parents.map((parent) => (
          <div
            key={parent.id}
            className="border-b py-2"
          >
            <p className="font-medium">
              {parent.name}
            </p>
            <p className="text-sm text-gray-600">
              Phone: {parent.phone}
            </p>
            <p className="text-sm text-gray-600">
              Telegram: {parent.telegramId || "Not set"}
            </p>
          </div>
        ))}
      </div>

      {/* Reports */}
      <div className="bg-white p-6 rounded-2xl shadow">
        <h2 className="font-semibold mb-4">
          Lesson Reports
        </h2>

        {student.reports.length === 0 && (
          <p>No reports yet</p>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th>Date</th>
              <th>Teacher</th>
              <th>Attendance</th>
              <th>Homework</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {student.reports.map((report) => (
            <tr key={report.id}>
  <td>{report.date.toLocaleDateString()}</td>
  <td>{report.teacher.name}</td>

  <td colSpan={3}>
    <form action={updateReport} className="flex gap-2 items-center">
      <input type="hidden" name="id" value={report.id} />

      <select
        name="attendance"
        defaultValue={report.attendance}
        className="border p-1 rounded text-sm"
      >
        <option value="PRESENT">Present</option>
        <option value="ABSENT">Absent</option>
      </select>

      <select
        name="homework"
        defaultValue={report.homework}
        className="border p-1 rounded text-sm"
      >
        <option value="DONE">Done</option>
        <option value="PARTIAL">Partial</option>
        <option value="NOT_DONE">Not Done</option>
      </select>

      <input
        name="comment"
        defaultValue={report.comment || ""}
        className="border p-1 rounded text-sm"
      />

      <button className="text-blue-600 text-sm hover:underline">
        Save
      </button>
    </form>
  </td>
</tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Support Sessions */}
      <div className="bg-white p-6 rounded-2xl shadow">
        <h2 className="font-semibold mb-4">
          Support Sessions
        </h2>

        {student.supportSessions.length === 0 && (
          <p>No support sessions</p>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th>Date</th>
              <th>Support</th>
              <th>Hours</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {student.supportSessions.map((session) => {
              const hours =
                (session.endTime.getTime() -
                  session.startTime.getTime()) /
                (1000 * 60 * 60);

              return (
                <tr key={session.id} className="border-b">
                  <td className="py-2">
                    {session.startTime.toLocaleDateString()}
                  </td>
                  <td>{session.support.name}</td>
                  <td>{hours.toFixed(2)} h</td>
                  <td>{session.comment || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}