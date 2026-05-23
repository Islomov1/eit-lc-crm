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
  await prisma.student.update({
    where: { id: studentId },
    data: { groups: { disconnect: { id: groupId } } },
  });
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

export default async function TeacherStudentsPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const teacher = await prisma.user.findUnique({ where: { id: userId } });
  if (!teacher || teacher.role !== "TEACHER") redirect("/login");

  const month = currentYYYYMM();
  const [y, m] = month.split("-").map(Number);
  const periodStart = new Date(y, m - 1, 1);

  const myGroups = await prisma.group.findMany({
    where: { teacherId: userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

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
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Students</h1>
        <p className="text-sm text-gray-500 mt-1">{students.length} students across {myGroups.length} groups</p>
      </div>

      {/* Add new student */}
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

      {/* Student list */}
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