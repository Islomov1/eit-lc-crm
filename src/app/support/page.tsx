import { sendTelegramToStudentParents } from "@/lib/telegramDelivery";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import SupportSessionForm from "@/components/SupportSessionForm";

/* ================= CREATE SUPPORT SESSION ================= */

async function createSession(formData: FormData) {
  "use server";

  const cookieStore = await cookies();
  const supportId = cookieStore.get("userId")?.value;

  const studentId = formData.get("studentId")?.toString();
  const start = formData.get("start")?.toString();
  const end = formData.get("end")?.toString();
  const comment = formData.get("comment")?.toString();
  const sendToParents = formData.get("sendToParents")?.toString() === "1";

  if (!supportId || !studentId || !start || !end) return;

  const support = await prisma.user.findUnique({
    where: { id: supportId },
    select: { id: true, role: true, name: true },
  });
  if (!support || support.role !== "SUPPORT") return;

  const startTime = new Date(start);
  const endTime = new Date(end);

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) return;
  if (endTime <= startTime) return;

  const session = await prisma.supportSession.create({
    data: {
      studentId,
      supportId: support.id,
      startTime,
      endTime,
      comment: comment?.trim() || null,
    },
    include: {
      student: {
        include: { parents: true, group: true },
      },
    },
  });

  const student = session.student;
  const durationHours =
    (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tashkent",
    }).format(d);

  const startText = fmt(startTime);
  const endText = fmt(endTime);

  // Только RU + UZ (без английского)
  const msg = `
📚 ОТЧЁТ О ЗАНЯТИИ С АCADEMIC SUPPORT
EIT LC

Ученик: ${student.name}
Группа: ${student.group?.name ?? "-"}
Начало: ${startText}
Окончание: ${endText}
Длительность: ${durationHours.toFixed(2)} ч

Комментарий:
${comment?.trim() || "Комментарий отсутствует."}

Отправил(а): ${support.name}

—————————————

📚 AKADEMIK SUPPORT HISOBOTI
EIT LC

O‘quvchi: ${student.name}
Guruh: ${student.group?.name ?? "-"}
Boshlanishi: ${startText}
Tugashi: ${endText}
Davomiyligi: ${durationHours.toFixed(2)} soat

Izoh:
${comment?.trim() || "Izoh mavjud emas."}

Yubordi: ${support.name}
`.trim();

  // Опциональная отправка родителям (по чекбоксу)
  if (sendToParents) {
    await sendTelegramToStudentParents(
      studentId,
      msg,
      { type: "USER", id: support.id },
      { sourceType: "SUPPORT_SESSION", sourceId: session.id }
    );
  }

  revalidatePath("/support");
}

/* ================= PAGE ================= */

export default async function SupportPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) redirect("/login");

  const support = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!support || support.role !== "SUPPORT") {
    redirect("/");
  }

  const students = await prisma.student.findMany({
    include: {
      group: {
        select: { name: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const sessions = await prisma.supportSession.findMany({
    where: { supportId: support.id },
    include: { student: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const monthlySessions = await prisma.supportSession.findMany({
    where: {
      supportId: support.id,
      startTime: { gte: startOfMonth, lt: endOfMonth },
    },
  });

  const totalMonthlyHours = monthlySessions.reduce((sum, session) => {
    return (
      sum +
      (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60)
    );
  }, 0);

  const preparedStudents = students.map((student) => ({
    id: student.id,
    name: student.name,
    groupName: student.group?.name ?? null,
  }));

  const fmtTable = (d: Date) =>
    new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Tashkent",
    }).format(d);

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow p-6">
          <h1 className="text-2xl font-bold">Academic Support Panel</h1>
          <p className="text-sm text-gray-500 mt-1">EIT LC CRM</p>
        </div>

        <SupportSessionForm students={preparedStudents} action={createSession} />

        <div className="bg-white p-6 rounded-2xl shadow">
          <h2 className="font-semibold text-lg mb-2">This Month Summary</h2>
          <p className="text-2xl font-bold">{totalMonthlyHours.toFixed(2)} hours</p>
          <p className="text-sm text-slate-500 mt-1">
            Sessions this month: {monthlySessions.length}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="font-semibold mb-4">Your Recent Sessions</h2>

          {sessions.length === 0 ? (
            <p className="text-slate-500">No sessions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4">Student</th>
                    <th className="pr-4">Start</th>
                    <th className="pr-4">End</th>
                    <th className="pr-4">Hours</th>
                    <th>Comment</th>
                  </tr>
                </thead>

                <tbody>
                  {sessions.map((session) => {
                    const hours =
                      (session.endTime.getTime() - session.startTime.getTime()) /
                      (1000 * 60 * 60);

                    return (
                      <tr key={session.id} className="border-b align-top">
                        <td className="py-2 pr-4 font-medium">
                          {session.student.name}
                        </td>
                        <td className="pr-4">{fmtTable(session.startTime)}</td>
                        <td className="pr-4">{fmtTable(session.endTime)}</td>
                        <td className="pr-4">{hours.toFixed(2)} h</td>
                        <td className="max-w-[360px] py-2 text-slate-700">
                          <div className="line-clamp-3 whitespace-pre-wrap">
                            {session.comment || "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}