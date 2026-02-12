import { prisma } from "@/src/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AttendanceStatus, HomeworkStatus } from "@prisma/client";
import { sendTelegramMessage } from "@/src/lib/telegram";
/* ================= CREATE REPORT ================= */

async function createReport(formData: FormData) {
  "use server";

  const studentId = formData.get("studentId")?.toString();
  const teacherId = formData.get("teacherId")?.toString();
  const groupId = formData.get("groupId")?.toString();

  const attendance = formData.get("attendance")?.toString();
  const homework = formData.get("homework")?.toString();
  const comment = formData.get("comment")?.toString();

  if (
    !studentId ||
    !teacherId ||
    !groupId ||
    !attendance ||
    !homework
  ) {
    return;
  }

  // Type-safe cast
  const attendanceValue =
    attendance as AttendanceStatus;

  const homeworkValue =
    homework as HomeworkStatus;

  try {
  await prisma.report.create({
    data: {
      studentId,
      teacherId,
      groupId,
      attendance: attendanceValue,
      homework: homeworkValue,
      comment,
    },
  });
} catch {
  throw new Error("Report already submitted today");
}

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { parents: true },
  });

  if (!student) return;

const attendanceText =
  attendanceValue === "PRESENT"
    ? "Присутствовал"
    : "Отсутствовал";

const homeworkText =
  homeworkValue === "DONE"
    ? "Выполнено полностью"
    : homeworkValue === "PARTIAL"
    ? "Выполнено частично"
    : "Не выполнено";

const attendanceUz =
  attendanceValue === "PRESENT"
    ? "Darsda qatnashdi"
    : "Darsda qatnashmadi";

const homeworkUz =
  homeworkValue === "DONE"
    ? "To‘liq bajarilgan"
    : homeworkValue === "PARTIAL"
    ? "Qisman bajarilgan"
    : "Bajarilmagan";

const message = `
📚 ОТЧЁТ О ЗАНЯТИИ
Учебный центр EIT

Ученик: ${student.name}

Посещаемость: ${attendanceText}
Домашнее задание: ${homeworkText}
Комментарий преподавателя:
${comment || "Комментарий отсутствует."}

—————————————

📚 DARS HISOBOTI
EIT o‘quv markazi

O‘quvchi: ${student.name}

Qatnashuv: ${attendanceUz}
Uy vazifasi: ${homeworkUz}
O‘qituvchi izohi:
${comment || "Izoh mavjud emas."}
`;

  for (const parent of student.parents) {
    if (parent.telegramId) {
      await sendTelegramMessage(
        parent.telegramId,
        message
      );
    }
  }

  revalidatePath("/teacher");
}

/* ================= PAGE ================= */

export default async function TeacherPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) redirect("/login");

  const teacher = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!teacher || teacher.role !== "TEACHER") {
    redirect("/");
  }

  const groups = await prisma.group.findMany({
    where: { teacherId: teacher.id },
    include: {
      students: true,
    },
  });

  return (
    <div className="min-h-screen bg-gray-100 p-10">
      <h1 className="text-2xl font-bold mb-8">
        Teacher Panel
      </h1>

      {groups.length === 0 && (
        <p>No groups assigned</p>
      )}

      {groups.map((group) => (
        <div
          key={group.id}
          className="bg-white rounded-2xl shadow p-6 mb-10"
        >
          <h2 className="font-semibold text-lg mb-4">
            {group.name}
          </h2>

          {group.students.map((student) => (
            <form
              key={student.id}
              action={createReport}
              className="grid grid-cols-6 gap-4 items-center border-b py-3"
            >
              <input
                type="hidden"
                name="studentId"
                value={student.id}
              />
            
              <input
                type="hidden"
                name="groupId"
                value={group.id}
              />

              <div className="font-medium">
                {student.name}
              </div>

              <select
                name="attendance"
                className="border p-2 rounded"
              >
                <option value="PRESENT">
                  Present
                </option>
                <option value="ABSENT">
                  Absent
                </option>
              </select>

              <select
                name="homework"
                className="border p-2 rounded"
              >
                <option value="DONE">
                  Done
                </option>
                <option value="PARTIAL">
                  Partial
                </option>
                <option value="NOT_DONE">
                  Not Done
                </option>
              </select>

              <input
                name="comment"
                placeholder="Comment"
                className="border p-2 rounded col-span-2"
              />

              <button className="bg-black text-white px-4 py-2 rounded hover:opacity-80">
                Submit
              </button>
            </form>
          ))}
        </div>
      ))}
    </div>
  );
}