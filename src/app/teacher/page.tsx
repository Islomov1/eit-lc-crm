// src/app/teacher/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AttendanceStatus, HomeworkStatus } from "@prisma/client";
import { sendTelegramToStudentParents } from "@/lib/telegramDelivery";

/* ================= CREATE REPORT ================= */

async function createReport(formData: FormData) {
  "use server";

  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;

  const studentId = formData.get("studentId")?.toString();
  const groupId = formData.get("groupId")?.toString();
  const attendance = formData.get("attendance")?.toString();
  const homework = formData.get("homework")?.toString();
  const comment = formData.get("comment")?.toString();

  if (!teacherId || !studentId || !groupId || !attendance || !homework) return;

  // проверяем, что это реально учитель
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, role: true },
  });
  if (!teacher || teacher.role !== "TEACHER") return;

  const attendanceValue = attendance as AttendanceStatus;
  const homeworkValue = homework as HomeworkStatus;

  // dateKey (чтобы уникальность работала нормально)
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

  let report;
  try {
    report = await prisma.report.create({
      data: {
        studentId,
        teacherId: teacher.id,
        groupId,
        dateKey,
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
    include: { parents: true, group: true },
  });
  if (!student) return;

  const attendanceText = attendanceValue === "PRESENT" ? "Присутствовал" : "Отсутствовал";
  const homeworkText =
    homeworkValue === "DONE"
      ? "Выполнено полностью"
      : homeworkValue === "PARTIAL"
      ? "Выполнено частично"
      : "Не выполнено";

  const attendanceUz = attendanceValue === "PRESENT" ? "Darsda qatnashdi" : "Darsda qatnashmadi";
  const homeworkUz =
    homeworkValue === "DONE"
      ? "To‘liq bajarilgan"
      : homeworkValue === "PARTIAL"
      ? "Qisman bajarilgan"
      : "Bajarilmagan";

  const message = `
📚 ОТЧЁТ О ЗАНЯТИИ
EIT LC

Ученик: ${student.name}
Группа: ${student.group?.name ?? "-"}
Посещаемость: ${attendanceText}
Домашнее задание: ${homeworkText}
Комментарий:
${comment || "Комментарий отсутствует."}

Отправил(а): ${teacher.name}

—————————————

📚 DARS HISOBOTI
EIT LC

O‘quvchi: ${student.name}
Guruh: ${student.group?.name ?? "-"}
Qatnashuv: ${attendanceUz}
Uy vazifasi: ${homeworkUz}
Izoh:
${comment || "Izoh mavjud emas."}

Yubordi: ${teacher.name}
`.trim();

  // ✅ единая централизованная доставка + лог + dedupe + retry-friendly
  await sendTelegramToStudentParents(studentId, message, { type: "USER", id: teacher.id }, {
    sourceType: "REPORT",
    sourceId: report.id,
    // можно включить HTML/MarkdownV2 позже, сейчас plain text
    // parseMode: "HTML",
  });

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
      <h1 className="text-2xl font-bold mb-8">Teacher Panel</h1>

      {groups.length === 0 && <p>No groups assigned</p>}

      {groups.map((group) => (
        <div key={group.id} className="bg-white rounded-2xl shadow p-6 mb-10">
          <h2 className="font-semibold text-lg mb-4">{group.name}</h2>

          {group.students.map((student) => (
            <form
              key={student.id}
              action={createReport}
              className="grid grid-cols-6 gap-4 items-center border-b py-3"
            >
              <input type="hidden" name="studentId" value={student.id} />
              <input type="hidden" name="groupId" value={group.id} />

              <div className="font-medium">{student.name}</div>

              <select name="attendance" className="border p-2 rounded">
                <option value="PRESENT">Present</option>
                <option value="ABSENT">Absent</option>
              </select>

              <select name="homework" className="border p-2 rounded">
                <option value="DONE">Done</option>
                <option value="PARTIAL">Partial</option>
                <option value="NOT_DONE">Not Done</option>
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
