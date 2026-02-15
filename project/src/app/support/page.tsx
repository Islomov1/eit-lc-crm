import { sendTelegramMessage } from "@/src/lib/telegram";
import { prisma } from "@/src/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Image from "next/image";

/* ================= CREATE SUPPORT SESSION ================= */

async function createSession(formData: FormData) {
  "use server";

  const cookieStore = await cookies();
  const supportId = cookieStore.get("userId")?.value;

  const studentId = formData.get("studentId")?.toString();
  const start = formData.get("start")?.toString();
  const end = formData.get("end")?.toString();
  const comment = formData.get("comment")?.toString();

  if (!supportId || !studentId || !start || !end) return;

  // security: must be SUPPORT
  const support = await prisma.user.findUnique({
    where: { id: supportId },
    select: { id: true, role: true, name: true },
  });
  if (!support || support.role !== "SUPPORT") return;

  const startTime = new Date(start);
  const endTime = new Date(end);
  if (endTime <= startTime) return;

  const session = await prisma.supportSession.create({
    data: {
      studentId,
      supportId: support.id,
      startTime,
      endTime,
      comment,
    },
    include: {
      student: {
        include: { parents: true, group: true },
      },
    },
  });

  // ---- Telegram auto notify parents ----
  const student = session.student;
  const durationHours =
    (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

  const msg = `
📚 ACADEMIC SUPPORT SESSION
EIT LC

Student: ${student.name}
Group: ${student.group?.name ?? "-"}
Start: ${startTime.toLocaleString()}
End: ${endTime.toLocaleString()}
Duration: ${durationHours.toFixed(2)} h

Comment:
${comment || "No comment."}

Sent by: ${support.name}

—————————————

📚 AKADEMIK SUPPORT
EIT LC

O‘quvchi: ${student.name}
Guruh: ${student.group?.name ?? "-"}
Boshlanishi: ${startTime.toLocaleString()}
Tugashi: ${endTime.toLocaleString()}
Davomiyligi: ${durationHours.toFixed(2)} soat

Izoh:
${comment || "Izoh yo‘q."}

Yubordi: ${support.name}
`;

  for (const parent of student.parents) {
    if (parent.telegramId) {
      await sendTelegramMessage(parent.telegramId.toString(), msg);
    }
  }
  // -------------------------------------

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
    orderBy: { name: "asc" },
  });

  const sessions = await prisma.supportSession.findMany({
    where: { supportId: support.id },
    include: { student: true },
    orderBy: { createdAt: "desc" },
  });

  // CURRENT MONTH RANGE (strict)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const monthlySessions = await prisma.supportSession.findMany({
    where: {
      supportId: support.id,
      startTime: {
        gte: startOfMonth,
        lt: endOfMonth,
      },
    },
  });

  const totalMonthlyHours = monthlySessions.reduce((sum, session) => {
    return (
      sum +
      (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60)
    );
  }, 0);

  return (
    <div className="min-h-screen bg-gray-100 p-10 space-y-10">
      {/* HEADER */}
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="EIT LC CRM" width={40} height={40} />
        <div>
          <h1 className="text-2xl font-bold">Academic Support Panel</h1>
          <p className="text-sm text-gray-500">EIT LC CRM</p>
        </div>
      </div>

      {/* CREATE SESSION */}
      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <h2 className="font-semibold text-lg">Log Support Session</h2>

        <form action={createSession} className="grid grid-cols-4 gap-4">
          <select name="studentId" required className="border p-2 rounded">
            <option value="">Select student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>

          <input type="datetime-local" name="start" required className="border p-2 rounded" />

          <input type="datetime-local" name="end" required className="border p-2 rounded" />

          <input
            name="comment"
            placeholder="Comment"
            className="border p-2 rounded col-span-4"
          />

          <button className="col-span-4 bg-black text-white py-2 rounded-lg hover:opacity-80">
            Save Session
          </button>
        </form>
      </div>

      {/* MONTHLY SUMMARY */}
      <div className="bg-white p-6 rounded-2xl shadow">
        <h2 className="font-semibold text-lg mb-2">This Month Summary</h2>
        <p className="text-2xl font-bold">{totalMonthlyHours.toFixed(2)} hours</p>
      </div>

      {/* SESSION LIST */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="font-semibold mb-4">Your Sessions</h2>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2">Student</th>
              <th>Start</th>
              <th>End</th>
              <th>Hours</th>
            </tr>
          </thead>

          <tbody>
            {sessions.map((session) => {
              const hours =
                (session.endTime.getTime() - session.startTime.getTime()) /
                (1000 * 60 * 60);

              return (
                <tr key={session.id} className="border-b">
                  <td className="py-2">{session.student.name}</td>
                  <td>{session.startTime.toLocaleString()}</td>
                  <td>{session.endTime.toLocaleString()}</td>
                  <td>{hours.toFixed(2)} h</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
