// src/app/teacher/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { AttendanceStatus, HomeworkStatus, ScheduleType } from "@prisma/client";
import { sendTelegramToStudentParents } from "@/lib/telegramDelivery";
import { prisma } from "@/lib/prisma";

/* ================= HELPERS ================= */

function formatTodayRuUz(date: Date) {
  const ru = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  return ru; // можно позже добавить uz-формат отдельно
}

// ВАЖНО: локальная дата (а не UTC через toISOString), чтобы не было сдвига ночью
function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function scheduleLabel(schedule: ScheduleType) {
  if (schedule === "MWF") return "MWF";
  if (schedule === "TTS") return "TTS";
  return schedule;
}

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

  // Проверяем, что это реально учитель
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, role: true },
  });

  if (!teacher || teacher.role !== "TEACHER") return;

  const attendanceValue = attendance as AttendanceStatus;
  const homeworkValue = homework as HomeworkStatus;

  // Локальная дата (УЗ/локальная машина сервера), без UTC-сдвига
  const dateKey = getLocalDateKey(new Date());

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
    // Уже есть отчёт за сегодня для этого ученика
    throw new Error("Report already submitted today");
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { parents: true, group: true },
  });

  if (!student) return;

  const attendanceText =
    attendanceValue === "PRESENT" ? "Присутствовал" : "Отсутствовал";

  const homeworkText =
    homeworkValue === "DONE"
      ? "Выполнено полностью"
      : homeworkValue === "PARTIAL"
      ? "Выполнено частично"
      : "Не выполнено";

  const attendanceUz =
    attendanceValue === "PRESENT" ? "Darsda qatnashdi" : "Darsda qatnashmadi";

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

  // Один студент за один клик -> доставка его привязанным родителям
  await sendTelegramToStudentParents(
    studentId,
    message,
    { type: "USER", id: teacher.id },
    {
      sourceType: "REPORT",
      sourceId: report.id,
      // parseMode: "HTML",
    }
  );

  revalidatePath("/teacher");
}

/* ================= PAGE ================= */

type TeacherPageProps = {
  searchParams?: Promise<{
    schedule?: string;
  }>;
};

export default async function TeacherPage({ searchParams }: TeacherPageProps) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) redirect("/login");

  const teacher = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!teacher || teacher.role !== "TEACHER") {
    redirect("/");
  }

  const sp = (await searchParams) ?? {};
  const selectedSchedule: ScheduleType =
    sp.schedule === "TTS" ? "TTS" : "MWF"; // default MWF

  const groups = await prisma.group.findMany({
    where: {
      teacherId: teacher.id,
      schedule: selectedSchedule,
    },
    include: {
      students: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: [{ startTime: "asc" }, { name: "asc" }],
  });

  const today = new Date();

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-5 md:p-6 mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Teacher Panel</h1>
              <p className="text-sm text-slate-600 mt-1">
                Сегодня: {formatTodayRuUz(today)} • Отчёт отправляется по одному
                ученику
              </p>
            </div>

            {/* Tabs: MWF / TTS */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <Link
                href="/teacher?schedule=MWF"
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  selectedSchedule === "MWF"
                    ? "bg-white shadow text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                MWF
              </Link>
              <Link
                href="/teacher?schedule=TTS"
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                  selectedSchedule === "TTS"
                    ? "bg-white shadow text-slate-900"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                TTS
              </Link>
            </div>
          </div>
        </div>

        {/* Empty state */}
        {groups.length === 0 && (
          <div className="bg-white rounded-2xl shadow p-8 text-center text-slate-600">
            Нет групп в расписании <span className="font-semibold">{selectedSchedule}</span>.
          </div>
        )}

        {/* Groups (accordion via details/summary) */}
        <div className="space-y-4">
          {groups.map((group) => (
            <details
              key={group.id}
              className="bg-white rounded-2xl shadow overflow-hidden group"
              open
            >
              <summary className="list-none cursor-pointer p-5 md:p-6 border-b border-slate-100">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="font-semibold text-lg">{group.name}</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      {scheduleLabel(group.schedule)} • {group.startTime}–{group.endTime}
                      {" • "}
                      {group.students.length} student
                      {group.students.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="text-sm text-slate-500 group-open:hidden">
                    Открыть ▼
                  </div>
                  <div className="text-sm text-slate-500 hidden group-open:block">
                    Скрыть ▲
                  </div>
                </div>
              </summary>

              <div className="p-4 md:p-6">
                {group.students.length === 0 ? (
                  <p className="text-slate-500">В этой группе пока нет студентов.</p>
                ) : (
                  <div className="space-y-3">
                    {group.students.map((student) => (
                      <form
                        key={student.id}
                        action={createReport}
                        className="border rounded-xl p-3 md:p-4 bg-slate-50"
                      >
                        <input type="hidden" name="studentId" value={student.id} />
                        <input type="hidden" name="groupId" value={group.id} />

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                          {/* Student name */}
                          <div className="lg:col-span-3">
                            <div className="font-medium text-slate-900">
                              {student.name}
                            </div>
                          </div>

                          {/* Attendance */}
                          <div className="lg:col-span-2">
                            <select
                              name="attendance"
                              className="w-full border p-2 rounded-lg bg-white"
                              defaultValue="PRESENT"
                            >
                              <option value="PRESENT">Present</option>
                              <option value="ABSENT">Absent</option>
                            </select>
                          </div>

                          {/* Homework */}
                          <div className="lg:col-span-2">
                            <select
                              name="homework"
                              className="w-full border p-2 rounded-lg bg-white"
                              defaultValue="DONE"
                            >
                              <option value="DONE">Done</option>
                              <option value="PARTIAL">Partial</option>
                              <option value="NOT_DONE">Not Done</option>
                            </select>
                          </div>

                          {/* Comment */}
                          <div className="lg:col-span-4">
                            <input
                              name="comment"
                              placeholder="Comment (optional)"
                              className="w-full border p-2 rounded-lg bg-white"
                            />
                          </div>

                          {/* Submit */}
                          <div className="lg:col-span-1">
                            <button
                              type="submit"
                              className="w-full bg-black text-white px-4 py-2 rounded-lg hover:opacity-85 transition"
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}