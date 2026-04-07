import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { AttendanceStatus, HomeworkStatus, ScheduleType } from "@prisma/client";
import { sendTelegramToStudentParents } from "@/lib/telegramDelivery";
import { prisma } from "@/lib/prisma";

/* ── helpers ─────────────────────────────────────────────── */

function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatToday(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

/* ── create report ───────────────────────────────────────── */

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

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, role: true },
  });
  if (!teacher || teacher.role !== "TEACHER") return;

  const attendanceValue = attendance as AttendanceStatus;
  const homeworkValue = homework as HomeworkStatus;
  const dateKey = getLocalDateKey(new Date());

  let report;
  try {
    report = await prisma.report.create({
      data: { studentId, teacherId: teacher.id, groupId, dateKey, attendance: attendanceValue, homework: homeworkValue, comment },
    });
  } catch {
    return;
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { parents: true, group: true },
  });
  if (!student) return;

  const attendanceRu = attendanceValue === "PRESENT" ? "Присутствовал" : "Отсутствовал";
  const homeworkRu = homeworkValue === "DONE" ? "Выполнено полностью" : homeworkValue === "PARTIAL" ? "Выполнено частично" : "Не выполнено";
  const attendanceUz = attendanceValue === "PRESENT" ? "Darsda qatnashdi" : "Darsda qatnashmadi";
  const homeworkUz = homeworkValue === "DONE" ? "To'liq bajarilgan" : homeworkValue === "PARTIAL" ? "Qisman bajarilgan" : "Bajarilmagan";

  const message = `
📚 ОТЧЁТ О ЗАНЯТИИ — EIT LC

Ученик: ${student.name}
Группа: ${student.group?.name ?? "-"}
Посещаемость: ${attendanceRu}
Домашнее задание: ${homeworkRu}
Комментарий: ${comment || "Отсутствует"}

Отправил(а): ${teacher.name}

—————————————

📚 DARS HISOBOTI — EIT LC

O'quvchi: ${student.name}
Guruh: ${student.group?.name ?? "-"}
Qatnashuv: ${attendanceUz}
Uy vazifasi: ${homeworkUz}
Izoh: ${comment || "Mavjud emas"}

Yubordi: ${teacher.name}
`.trim();

  await sendTelegramToStudentParents(
    studentId,
    message,
    { type: "USER", id: teacher.id },
    { sourceType: "REPORT", sourceId: report.id }
  );

  revalidatePath("/teacher");
}

/* ── page ────────────────────────────────────────────────── */

type Props = { searchParams?: Promise<{ schedule?: string }> };

export default async function TeacherPage({ searchParams }: Props) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const selectedSchedule: ScheduleType =
    (await searchParams)?.schedule === "TTS" ? "TTS" : "MWF";

  const [teacher, groups] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.group.findMany({
      where: { schedule: selectedSchedule },
      include: { students: { orderBy: { name: "asc" } } },
      orderBy: [{ startTime: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!teacher || teacher.role !== "TEACHER") redirect("/login");

  const myGroups = groups.filter((g) => g.teacherId === teacher.id);
  const today = new Date();
  const dateKey = getLocalDateKey(today);

  const todayReports = await prisma.report.findMany({
    where: {
      teacherId: teacher.id,
      dateKey,
      groupId: { in: myGroups.map((g) => g.id) },
    },
    select: { studentId: true },
  });

  const reportedStudentIds = new Set(todayReports.map((r) => r.studentId));

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Groups</h1>
          <p className="text-sm text-gray-500 mt-1">{formatToday(today)}</p>
        </div>

        {/* Schedule tabs */}
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          {(["MWF", "TTS"] as ScheduleType[]).map((s) => (
            <Link
              key={s}
              href={`/teacher?schedule=${s}`}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                selectedSchedule === s
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold text-gray-900">{myGroups.length}</p>
          <p className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">Groups</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {myGroups.reduce((s, g) => s + g.students.length, 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">Students</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-2xl font-bold text-green-600">{reportedStudentIds.size}</p>
          <p className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-wide">Reported</p>
        </div>
      </div>

      {/* Empty state */}
      {myGroups.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
          No groups assigned for <strong>{selectedSchedule}</strong> schedule.
        </div>
      )}

      {/* Groups */}
      <div className="space-y-4">
        {myGroups.map((group) => {
          const reportedCount = group.students.filter((s) => reportedStudentIds.has(s.id)).length;
          const allDone = reportedCount === group.students.length && group.students.length > 0;

          return (
            <details
              key={group.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              open
            >
              <summary className="list-none cursor-pointer px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="font-semibold text-gray-900">{group.name}</h2>
                      {allDone && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                          ✓ All done
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {group.schedule} · {group.startTime}–{group.endTime} · {group.students.length} students
                      {reportedCount > 0 && (
                        <span className="ml-2 text-green-600 font-medium">· {reportedCount} reported</span>
                      )}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">▼</span>
                </div>
              </summary>

              <div className="p-4 space-y-2">
                {group.students.length === 0 ? (
                  <p className="text-gray-400 text-sm p-2">No students in this group.</p>
                ) : (
                  group.students.map((student) => {
                    const reported = reportedStudentIds.has(student.id);
                    return (
                      <form
                        key={student.id}
                        action={createReport}
                        className={`rounded-xl px-4 py-3 border transition ${
                          reported ? "bg-green-50 border-green-200 opacity-60" : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <input type="hidden" name="studentId" value={student.id} />
                        <input type="hidden" name="groupId" value={group.id} />

                       <div className="grid items-center gap-3" style={{ gridTemplateColumns: "200px 120px 130px 1fr auto" }}>
  {/* Name */}
  <div className="font-medium text-gray-900 text-sm flex items-center gap-2 min-w-0">
    {reported && <span className="text-green-500">✓</span>}
    <span className="truncate">{student.name}</span>
  </div>

  {/* Attendance */}
  <select
    name="attendance"
    defaultValue="PRESENT"
    disabled={reported}
    className="h-9 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
  >
    <option value="PRESENT">Present</option>
    <option value="ABSENT">Absent</option>
  </select>

  {/* Homework */}
  <select
    name="homework"
    defaultValue="DONE"
    disabled={reported}
    className="h-9 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
  >
    <option value="DONE">Done</option>
    <option value="PARTIAL">Partial</option>
    <option value="NOT_DONE">Not Done</option>
  </select>

  {/* Comment */}
  <input
    name="comment"
    placeholder="Comment..."
    disabled={reported}
    className="h-9 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
  />

  {/* Button */}
  {reported ? (
    <div className="h-9 px-4 flex items-center rounded-xl bg-green-100 text-green-700 text-xs font-semibold whitespace-nowrap">
      Sent ✓
    </div>
  ) : (
    <button
      type="submit"
      className="h-9 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition whitespace-nowrap"
    >
      Send
    </button>
  )}
</div>
                      </form>
                    );
                  })
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}