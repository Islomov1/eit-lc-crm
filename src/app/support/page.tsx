import { sendTelegramToStudentParents } from "@/lib/telegramDelivery";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import SupportSessionForm from "@/components/SupportSessionForm";

/* ── create session ──────────────────────────────────────── */

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
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return;
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
      student: { include: { parents: true, groups: true } }, // ✅
    },
  });

  if (sendToParents) {
    const student = session.student;
    const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Tashkent",
      }).format(d);

    const groupName = student.groups[0]?.name ?? "-"; // ✅

    const msg = `
📚 ACADEMIC SUPPORT HISOBOTI — EIT LC

O'quvchi: ${student.name}
Guruh: ${groupName}
Boshlanishi: ${fmt(startTime)}
Tugashi: ${fmt(endTime)}
Davomiyligi: ${durationHours.toFixed(2)} soat

Izoh:
${comment?.trim() || "Mavjud emas"}

Yubordi: ${support.name}

—————————————

📚 ОТЧЁТ ACADEMIC SUPPORT — EIT LC

Ученик: ${student.name}
Группа: ${groupName}
Начало: ${fmt(startTime)}
Окончание: ${fmt(endTime)}
Длительность: ${durationHours.toFixed(2)} ч

Комментарий:
${comment?.trim() || "Отсутствует"}

Отправил(а): ${support.name}
    `.trim();

    await sendTelegramToStudentParents(
      studentId,
      msg,
      { type: "USER", id: support.id },
      { sourceType: "SUPPORT_SESSION", sourceId: session.id }
    );
  }

  revalidatePath("/support");
}

/* ── page ────────────────────────────────────────────────── */

export default async function SupportPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const support = await prisma.user.findUnique({ where: { id: userId } });
  if (!support || support.role !== "SUPPORT") redirect("/login");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [students, sessions, monthlySessions] = await Promise.all([
    prisma.student.findMany({
      include: { groups: { select: { name: true }, take: 1 } }, // ✅
      orderBy: { name: "asc" },
    }),
    prisma.supportSession.findMany({
      where: { supportId: support.id },
      include: { student: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.supportSession.findMany({
      where: { supportId: support.id, startTime: { gte: startOfMonth, lt: endOfMonth } },
    }),
  ]);

  const totalMonthlyHours = monthlySessions.reduce(
    (sum, s) => sum + (s.endTime.getTime() - s.startTime.getTime()) / (1000 * 60 * 60),
    0
  );

  const preparedStudents = students.map((s) => ({
    id: s.id,
    name: s.name,
    groupName: s.groups[0]?.name ?? null, // ✅
  }));

  const fmtTable = (d: Date) =>
    new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Tashkent",
    }).format(d);

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Support Sessions</h1>
        <p className="text-sm text-gray-500 mt-1">EIT LC · Academic Support</p>
      </div>

      {/* Monthly summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{totalMonthlyHours.toFixed(1)}</p>
          <p className="text-xs text-gray-400 mt-1 font-semibold uppercase tracking-wide">Hours this month</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{monthlySessions.length}</p>
          <p className="text-xs text-gray-400 mt-1 font-semibold uppercase tracking-wide">Sessions this month</p>
        </div>
      </div>

      {/* Session form */}
      <SupportSessionForm students={preparedStudents} action={createSession} />

      {/* Sessions table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Sessions</h2>
          <span className="text-xs text-gray-400">{sessions.length} sessions</span>
        </div>

        {sessions.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-400">No sessions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "600px" }}>
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Start</th>
                  <th className="px-6 py-3">End</th>
                  <th className="px-6 py-3">Hours</th>
                  <th className="px-6 py-3">Comment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.map((session) => {
                  const hours =
                    (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60);
                  return (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{session.student.name}</td>
                      <td className="px-6 py-3 text-gray-600 text-xs">{fmtTable(session.startTime)}</td>
                      <td className="px-6 py-3 text-gray-600 text-xs">{fmtTable(session.endTime)}</td>
                      <td className="px-6 py-3 font-semibold text-gray-900">{hours.toFixed(2)}h</td>
                      <td className="px-6 py-3 text-gray-500 max-w-[260px]">
                        <div className="line-clamp-2 text-xs whitespace-pre-line">
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
  );
}