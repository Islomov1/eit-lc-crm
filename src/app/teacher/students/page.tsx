import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TeacherStudentCard } from "@/components/TeacherStudentCard";

export const revalidate = 30;

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ── GROUP ACTIONS ────────────────────────────────────────── */

async function createGroup(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;
  if (!teacherId) return;
  const name = formData.get("name")?.toString().trim();
  const schedule = formData.get("schedule")?.toString() as "MWF" | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  const programId = formData.get("programId")?.toString();
  if (!name || !schedule || !startTime || !endTime || !programId) return;
  await prisma.group.create({
    data: { name, schedule, startTime, endTime, programId, teacherId, month: 1, status: "ACTIVE" },
  });
  revalidatePath("/teacher/students");
}

async function updateGroup(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;
  if (!teacherId) return;
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const schedule = formData.get("schedule")?.toString() as "MWF" | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  if (!id || !name || !schedule || !startTime || !endTime) return;
  const group = await prisma.group.findFirst({ where: { id, teacherId } });
  if (!group) return;
  await prisma.group.update({ where: { id }, data: { name, schedule, startTime, endTime } });
  revalidatePath("/teacher/students");
}

async function deleteGroup(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;
  if (!teacherId) return;
  const id = formData.get("id")?.toString();
  if (!id) return;
  const group = await prisma.group.findFirst({ where: { id, teacherId } });
  if (!group) return;
  const studentsInGroup = await prisma.student.findMany({
    where: { groups: { some: { id } } },
    select: { id: true },
  });
  for (const s of studentsInGroup) {
    await prisma.student.update({ where: { id: s.id }, data: { groups: { disconnect: { id } } } });
  }
  await prisma.report.deleteMany({ where: { groupId: id } });
  await prisma.group.delete({ where: { id } });
  revalidatePath("/teacher/students");
}

/* ── STUDENT ACTIONS ──────────────────────────────────────── */

async function createStudent(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;
  if (!teacherId) return;
  const name = formData.get("name")?.toString().trim();
  const groupId = formData.get("groupId")?.toString();
  if (!name || !groupId) return;
  const group = await prisma.group.findFirst({ where: { id: groupId, teacherId } });
  if (!group) return;
  await prisma.student.create({ data: { name, groups: { connect: { id: groupId } } } });
  revalidatePath("/teacher/students");
}

async function updateStudent(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;
  if (!teacherId) return;
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const newGroupId = formData.get("newGroupId")?.toString();
  const oldGroupId = formData.get("oldGroupId")?.toString();
  if (!id || !name) return;
  if (newGroupId) {
    const group = await prisma.group.findFirst({ where: { id: newGroupId, teacherId } });
    if (!group) return;
  }
  await prisma.student.update({
    where: { id },
    data: {
      name,
      ...(newGroupId && oldGroupId && newGroupId !== oldGroupId
        ? { groups: { disconnect: { id: oldGroupId }, connect: { id: newGroupId } } }
        : {}),
    },
  });
  revalidatePath("/teacher/students");
}

async function removeFromGroup(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;
  if (!teacherId) return;
  const studentId = formData.get("studentId")?.toString();
  const groupId = formData.get("groupId")?.toString();
  if (!studentId || !groupId) return;
  const group = await prisma.group.findFirst({ where: { id: groupId, teacherId } });
  if (!group) return;
  await prisma.student.update({ where: { id: studentId }, data: { groups: { disconnect: { id: groupId } } } });
  revalidatePath("/teacher/students");
}

async function addParent(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;
  if (!teacherId) return;
  const studentId = formData.get("studentId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  if (!studentId || !name || !phone) return;
  await prisma.parent.create({ data: { name, phone, studentId } });
  revalidatePath("/teacher/students");
}

async function removeParent(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;
  if (!teacherId) return;
  const id = formData.get("id")?.toString();
  if (!id) return;
  await prisma.parent.delete({ where: { id } });
  revalidatePath("/teacher/students");
}

/* ── PAGE ─────────────────────────────────────────────────── */

export default async function TeacherStudentsPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const teacher = await prisma.user.findUnique({ where: { id: userId } });
  if (!teacher || teacher.role !== "TEACHER") redirect("/login");

  const month = currentYYYYMM();
  const [y, m] = month.split("-").map(Number);
  const periodStart = new Date(y, m - 1, 1);

  const [myGroupsFull, programs] = await Promise.all([
    prisma.group.findMany({
      where: { teacherId: userId },
      orderBy: { name: "asc" },
      include: { program: { select: { name: true } }, _count: { select: { students: true } } },
    }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
  ]);

  const myGroups = myGroupsFull.map((g) => ({ id: g.id, name: g.name }));
  const groupIds = myGroups.map((g) => g.id);

  const students = await prisma.student.findMany({
    where: { groups: { some: { id: { in: groupIds } } } },
    include: {
      groups: { where: { id: { in: groupIds } }, select: { id: true, name: true } },
      parents: { select: { id: true, name: true, phone: true, telegramId: true } },
      payments: { where: { periodStart, teacherId: userId }, select: { status: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* ── MY GROUPS ─────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Groups</h1>
        <p className="text-sm text-gray-500 mt-1">{myGroupsFull.length} groups</p>
      </div>

      {/* Create group */}
      <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50 transition list-none flex items-center justify-between">
          <span>+ Create New Group</span>
          <span className="text-gray-400 text-xs">▼</span>
        </summary>
        <div className="px-6 pb-5 pt-3 border-t border-gray-100">
          <form action={createGroup} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Group name</label>
              <input name="name" placeholder="e.g. IELTS Monday 17:00" required className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Schedule</label>
              <select name="schedule" required className="h-10 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="MWF">Mon-Wed-Fri</option>
                <option value="TTS">Tue-Thu-Sat</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Start</label>
              <input type="time" name="startTime" required className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">End</label>
              <input type="time" name="endTime" required className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Program</label>
              <select name="programId" required defaultValue="" className="h-10 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="" disabled>Select program</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <button className="col-span-2 sm:col-span-3 h-10 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
              Create Group
            </button>
          </form>
        </div>
      </details>

      {/* Groups list */}
      {myGroupsFull.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
          No groups yet. Create your first group above.
        </div>
      ) : (
        <div className="space-y-3">
          {myGroupsFull.map((group) => (
            <div key={group.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-bold text-gray-900">{group.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {group.schedule} · {group.startTime}–{group.endTime} · {group.program?.name} · {group._count.students} students
                  </p>
                </div>
                <form action={deleteGroup}>
                  <input type="hidden" name="id" value={group.id} />
                  <button type="submit" className="h-8 px-3 rounded-xl text-xs font-semibold border" style={{ background: "#fff1f2", color: "#f43f5e", borderColor: "#fecdd3" }}>
                    Delete
                  </button>
                </form>
              </div>
              <div className="px-6 py-3 border-t border-dashed border-gray-100 bg-gray-50/50">
                <form action={updateGroup} className="flex gap-2 flex-wrap items-center">
                  <input type="hidden" name="id" value={group.id} />
                  <input name="name" defaultValue={group.name} className="h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 flex-1 min-w-[140px]" />
                  <select name="schedule" defaultValue={group.schedule} className="h-9 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="MWF">MWF</option>
                    <option value="TTS">TTS</option>
                  </select>
                  <input type="time" name="startTime" defaultValue={group.startTime} className="h-9 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  <input type="time" name="endTime" defaultValue={group.endTime} className="h-9 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  <button type="submit" className="h-9 px-4 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">Save</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MY STUDENTS ───────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-xl font-bold text-gray-900">My Students</h2>
        <p className="text-sm text-gray-500 mt-1">{students.length} students</p>
      </div>

      <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50 transition list-none flex items-center justify-between">
          <span>+ Add New Student</span>
          <span className="text-gray-400 text-xs">▼</span>
        </summary>
        <div className="px-6 pb-5 pt-2 border-t border-gray-100">
          <form action={createStudent} className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[180px] space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</label>
              <input name="name" placeholder="Student full name" required className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <div className="w-48 space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Group</label>
              <select name="groupId" required defaultValue="" className="h-10 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="" disabled>Select group</option>
                {myGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <button className="h-10 px-6 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">Create</button>
          </form>
        </div>
      </details>

      {students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
          No students in your groups yet.
        </div>
      ) : (
        <div className="space-y-3">
          {students.map((student) => {
            const isPaid = student.payments.some((p) => p.status === "PAID" || p.status === "PARTIAL");
            return (
              <TeacherStudentCard
                key={student.id}
                student={{ ...student, isPaid }}
                allGroups={myGroups}
                updateStudent={updateStudent}
                removeFromGroup={removeFromGroup}
                addParent={addParent}
                removeParent={removeParent}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}