import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export const revalidate = 30;

/* ── helpers ─────────────────────────────────────────────── */

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ── server actions ──────────────────────────────────────── */

async function createStudent(formData: FormData) {
  "use server";
  const cookieStore = await cookies();
  const teacherId = cookieStore.get("userId")?.value;
  if (!teacherId) return;

  const name = formData.get("name")?.toString().trim();
  const groupId = formData.get("groupId")?.toString();
  if (!name || !groupId) return;

  // Verify teacher owns this group
  const group = await prisma.group.findFirst({ where: { id: groupId, teacherId } });
  if (!group) return;

  await prisma.student.create({
    data: { name, groups: { connect: { id: groupId } } },
  });
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

  // Verify teacher owns the group
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

  // Verify teacher owns the group
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

/* ── page ────────────────────────────────────────────────── */

export default async function TeacherStudentsPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const teacher = await prisma.user.findUnique({ where: { id: userId } });
  if (!teacher || teacher.role !== "TEACHER") redirect("/login");

  const month = currentYYYYMM();
  const [y, m] = month.split("-").map(Number);
  const periodStart = new Date(y, m - 1, 1);

  // All groups belonging to this teacher
  const myGroups = await prisma.group.findMany({
    where: { teacherId: userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const groupIds = myGroups.map((g) => g.id);

  // All students in teacher's groups
  const students = await prisma.student.findMany({
    where: { groups: { some: { id: { in: groupIds } } } },
    include: {
      groups: {
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      },
      parents: { select: { id: true, name: true, phone: true, telegramId: true } },
      payments: {
        where: { periodStart, teacherId: userId },
        select: { status: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Students</h1>
          <p className="text-sm text-gray-500 mt-1">
            {students.length} students across {myGroups.length} groups
          </p>
        </div>
      </div>

      {/* Add new student */}
      <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
        <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50 transition list-none flex items-center justify-between">
          <span>+ Add New Student</span>
          <span className="text-gray-400 text-xs">▼</span>
        </summary>
        <div className="px-6 pb-5 pt-2 border-t border-gray-100">
          <form action={createStudent} className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[180px] space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</label>
              <input
                name="name"
                placeholder="Student full name"
                required
                className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="w-48 space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Group</label>
              <select
                name="groupId"
                required
                defaultValue=""
                className="h-10 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="" disabled>Select group</option>
                {myGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <button className="h-10 px-6 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
              Create
            </button>
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
            const isPaid = student.payments.some(
              (p) => p.status === "PAID" || p.status === "PARTIAL"
            );
            const studentGroup = student.groups[0];

            return (
              <div key={student.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

                {/* Student header */}
                <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: "#f3f4f6", color: "#6b7280" }}
                    >
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-base">{student.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {student.groups.map((g) => (
                          <span
                            key={g.id}
                            style={{ background: "#ede9fe", color: "#6d28d9", padding: "1px 8px", borderRadius: "999px", fontSize: "11px", fontWeight: 600 }}
                          >
                            {g.name}
                          </span>
                        ))}
                        <span
                          style={{
                            background: isPaid ? "#dcfce7" : "#fee2e2",
                            color: isPaid ? "#166534" : "#991b1b",
                            padding: "1px 8px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 600,
                          }}
                        >
                          {isPaid ? "✓ Paid" : "✗ Not paid"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Edit name + change group */}
                <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50">
                  <form action={updateStudent} className="flex gap-2 flex-wrap items-center">
                    <input type="hidden" name="id" value={student.id} />
                    <input type="hidden" name="oldGroupId" value={studentGroup?.id ?? ""} />
                    <input
                      name="name"
                      defaultValue={student.name}
                      className="h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[160px] flex-1"
                    />
                    <select
                      name="newGroupId"
                      defaultValue={studentGroup?.id ?? ""}
                      className="h-9 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-44"
                    >
                      {myGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="h-9 px-4 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition"
                    >
                      Save
                    </button>

                    {/* Remove from group */}
                    {studentGroup && (
                      <button
                        type="submit"
                        formAction={removeFromGroup}
                        name="studentId"
                        value={student.id}
                        className="h-9 px-4 rounded-xl bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100 transition border border-red-100"
                        onClick={(e) => {
                          const form = e.currentTarget.closest("form");
                          if (form) {
                            const input = document.createElement("input");
                            input.type = "hidden";
                            input.name = "groupId";
                            input.value = studentGroup.id;
                            form.appendChild(input);
                          }
                        }}
                      >
                        Remove from group
                      </button>
                    )}
                  </form>
                </div>

                {/* Remove from group — separate form to avoid conflict */}
                {studentGroup && (
                  <div className="px-6 pb-3 bg-gray-50/50">
                    <form action={removeFromGroup} className="inline">
                      <input type="hidden" name="studentId" value={student.id} />
                      <input type="hidden" name="groupId" value={studentGroup.id} />
                    </form>
                  </div>
                )}

                {/* Parents */}
                {student.parents.length > 0 && (
                  <div className="border-t border-gray-100">
                    {student.parents.map((parent) => (
                      <div key={parent.id} className="flex items-center justify-between gap-3 px-6 py-3 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: "#f3f4f6", color: "#6b7280" }}
                          >
                            {parent.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{parent.name}</p>
                            <p className="text-xs text-gray-400">{parent.phone}</p>
                          </div>
                          <span
                            style={{
                              background: parent.telegramId ? "#dcfce7" : "#f3f4f6",
                              color: parent.telegramId ? "#166534" : "#9ca3af",
                              padding: "1px 8px",
                              borderRadius: "999px",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            {parent.telegramId ? "✓ TG" : "No TG"}
                          </span>
                        </div>
                        <form action={removeParent}>
                          <input type="hidden" name="id" value={parent.id} />
                          <button className="text-xs text-red-400 hover:text-red-600 transition font-medium">
                            Remove
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add parent */}
                <div className="px-6 py-3 border-t border-gray-100">
                  <details className="group/parent">
                    <summary className="list-none cursor-pointer text-sm text-gray-400 hover:text-gray-700 transition font-medium">
                      + Add parent
                    </summary>
                    <form action={addParent} className="flex gap-2 flex-wrap items-center mt-3">
                      <input type="hidden" name="studentId" value={student.id} />
                      <input
                        name="name"
                        placeholder="Parent name"
                        required
                        className="h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[140px] flex-1"
                      />
                      <input
                        name="phone"
                        placeholder="+998..."
                        required
                        className="h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[140px] flex-1"
                      />
                      <button className="h-9 px-4 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
                        Add
                      </button>
                    </form>
                  </details>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}