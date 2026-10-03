import { ActionForm } from "@/components/ActionForm";
import { assertTeacherStudent } from "@/lib/auth";
import { audit } from "@/lib/audit";
import Pagination from "@/components/Pagination";
import { dateKey, pageNumber } from "@/lib/format";

import { requireRole } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TeacherStudentCard } from "@/components/TeacherStudentCard";

export const revalidate = 30;

function currentYYYYMM() {
  return dateKey().slice(0, 7);
}

/* ── GROUP ACTIONS ────────────────────────────────────────── */

async function createGroup(formData: FormData) {
  "use server";
  await requireRole("TEACHER");
  const teacherId = (await getCurrentUser())?.id;
  if (!teacherId) return;
  const name = formData.get("name")?.toString().trim();
  const schedule = formData.get("schedule")?.toString() as "MWF" | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  const programId = formData.get("programId")?.toString();
  if (!name || !schedule || !startTime || !endTime || !programId) return;
  if (
    !["MWF", "TTS"].includes(schedule) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
    startTime >= endTime
  )
    throw new Error("Проверьте расписание и время");
  const created = await prisma.group.create({
    data: {
      name,
      schedule,
      startTime,
      endTime,
      programId,
      teacherId,
      month: 1,
      status: "ACTIVE",
    },
  });
  await audit(
    await requireRole("TEACHER"),
    "CREATE",
    "Group",
    created.id,
    `Создана группа ${name}`,
  );
  revalidatePath("/teacher/students");
}

async function updateGroup(formData: FormData) {
  "use server";
  await requireRole("TEACHER");
  const teacherId = (await getCurrentUser())?.id;
  if (!teacherId) return;
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const schedule = formData.get("schedule")?.toString() as "MWF" | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  if (!id || !name || !schedule || !startTime || !endTime) return;
  const group = await prisma.group.findFirst({ where: { id, teacherId } });
  if (!group) return;
  if (
    !["MWF", "TTS"].includes(schedule) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
    startTime >= endTime
  )
    throw new Error("Проверьте расписание и время");
  await prisma.group.update({
    where: { id },
    data: { name, schedule, startTime, endTime },
  });
  await audit(
    await requireRole("TEACHER"),
    "UPDATE",
    "Group",
    id,
    `Расписание: ${group.name} → ${name}, ${schedule} ${startTime}–${endTime}`,
  );
  revalidatePath("/teacher/students");
}

async function deleteGroup(formData: FormData) {
  "use server";
  await requireRole("TEACHER");
  const teacherId = (await getCurrentUser())?.id;
  if (!teacherId) return;
  const id = formData.get("id")?.toString();
  if (!id) return;
  const group = await prisma.group.findFirst({ where: { id, teacherId } });
  if (!group) return;
  await prisma.group.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  await audit(
    await requireRole("TEACHER"),
    "ARCHIVE",
    "Group",
    id,
    `Архивирована группа ${group.name}`,
  );
  revalidatePath("/teacher/students");
}

/* ── STUDENT ACTIONS ──────────────────────────────────────── */

async function createStudent(formData: FormData) {
  "use server";
  await requireRole("TEACHER");
  const teacherId = (await getCurrentUser())?.id;
  if (!teacherId) return;
  const name = formData.get("name")?.toString().trim();
  const groupId = formData.get("groupId")?.toString();
  if (!name || !groupId) return;
  const group = await prisma.group.findFirst({
    where: { id: groupId, teacherId, archivedAt: null },
  });
  if (!group) return;
  const student = await prisma.student.create({
    data: { name, groups: { connect: { id: groupId } } },
  });
  await audit(
    await requireRole("TEACHER"),
    "CREATE",
    "Student",
    student.id,
    `Ученик добавлен в ${group.name}`,
  );
  revalidatePath("/teacher/students");
}

async function updateStudent(formData: FormData) {
  "use server";
  await requireRole("TEACHER");
  const teacherId = (await getCurrentUser())?.id;
  if (!teacherId) return;
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const newGroupId = formData.get("newGroupId")?.toString();
  const oldGroupId = formData.get("oldGroupId")?.toString();
  if (!id || !name) return;
  await assertTeacherStudent(teacherId, id);
  if (
    oldGroupId &&
    !(await prisma.group.findFirst({
      where: {
        id: oldGroupId,
        teacherId,
        archivedAt: null,
        students: { some: { id } },
      },
    }))
  )
    throw new Error("Нет доступа к группе");
  if (newGroupId) {
    const group = await prisma.group.findFirst({
      where: { id: newGroupId, teacherId, archivedAt: null },
    });
    if (!group) return;
  }
  await prisma.student.update({
    where: { id },
    data: {
      name,
      ...(newGroupId && oldGroupId && newGroupId !== oldGroupId
        ? {
            groups: {
              disconnect: { id: oldGroupId },
              connect: { id: newGroupId },
            },
          }
        : {}),
    },
  });
  revalidatePath("/teacher/students");
}

async function removeFromGroup(formData: FormData) {
  "use server";
  await requireRole("TEACHER");
  const teacherId = (await getCurrentUser())?.id;
  if (!teacherId) return;
  const studentId = formData.get("studentId")?.toString();
  const groupId = formData.get("groupId")?.toString();
  if (!studentId || !groupId) return;
  const group = await prisma.group.findFirst({
    where: { id: groupId, teacherId, archivedAt: null },
  });
  if (!group) return;
  await prisma.student.update({
    where: { id: studentId },
    data: { groups: { disconnect: { id: groupId } } },
  });
  await audit(
    await requireRole("TEACHER"),
    "UNENROLL",
    "Student",
    studentId,
    `Ученик убран из ${group.name}`,
  );
  revalidatePath("/teacher/students");
}

async function addParent(formData: FormData) {
  "use server";
  await requireRole("TEACHER");
  const teacherId = (await getCurrentUser())?.id;
  if (!teacherId) return;
  const studentId = formData.get("studentId")?.toString();
  const name = formData.get("name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  if (!studentId || !name || !phone) return;
  await assertTeacherStudent(teacherId, studentId);
  await prisma.parent.create({ data: { name, phone, studentId } });
  await audit(
    await requireRole("TEACHER"),
    "PARENT",
    "Student",
    studentId,
    `Добавлен родитель ${name}`,
  );
  revalidatePath("/teacher/students");
}

async function removeParent(formData: FormData) {
  "use server";
  await requireRole("TEACHER");
  const teacherId = (await getCurrentUser())?.id;
  if (!teacherId) return;
  const id = formData.get("id")?.toString();
  if (!id) return;
  const parent = await prisma.parent.findUniqueOrThrow({ where: { id } });
  await assertTeacherStudent(teacherId, parent.studentId);
  await prisma.parent.update({ where: { id }, data: { telegramId: null } });
  await prisma.telegramPendingLink.updateMany({
    where: { parentId: id, status: "PENDING" },
    data: { status: "REJECTED" },
  });
  await prisma.parentInvite.updateMany({
    where: { parentId: id, usedAt: null },
    data: { expiresAt: new Date(0) },
  });
  await audit(
    await requireRole("TEACHER"),
    "UNLINK",
    "Student",
    parent.studentId,
    `Отключён Telegram родителя ${parent.name}`,
  );
  revalidatePath("/teacher/students");
}

/* ── PAGE ─────────────────────────────────────────────────── */

export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageNumber((await searchParams).page);
  await requireRole("TEACHER");
  const userId = (await getCurrentUser())?.id;
  if (!userId) redirect("/login");

  const teacher = await prisma.user.findUnique({ where: { id: userId } });
  if (!teacher || teacher.role !== "TEACHER") redirect("/login");

  const month = currentYYYYMM();
  const [y, m] = month.split("-").map(Number);
  const periodStart = new Date(Date.UTC(y, m - 1, 1));

  const [myGroupsFull, programs] = await Promise.all([
    prisma.group.findMany({
      where: { teacherId: userId, archivedAt: null },
      orderBy: { name: "asc" },
      include: {
        program: { select: { name: true } },
        _count: { select: { students: true } },
      },
    }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
  ]);

  const myGroups = myGroupsFull.map((g) => ({ id: g.id, name: g.name }));
  const groupIds = myGroups.map((g) => g.id);

  const totalStudents = await prisma.student.count({
    where: { archivedAt: null, groups: { some: { id: { in: groupIds } } } },
  });
  const students = await prisma.student.findMany({
    take: 30,
    skip: (page - 1) * 30,
    where: { archivedAt: null, groups: { some: { id: { in: groupIds } } } },
    include: {
      groups: {
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      },
      parents: {
        select: { id: true, name: true, phone: true, telegramId: true },
      },
      payments: {
        where: { periodStart, teacherId: userId },
        select: { status: true, groupId: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* ── MY GROUPS ─────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Мои группы</h1>
        <p className="text-sm text-gray-500 mt-1">
          {myGroupsFull.length} groups
        </p>
      </div>

      {/* Create group */}
      <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50 transition list-none flex items-center justify-between">
          <span>+ Создать группу</span>
          <span className="text-gray-400 text-xs">▼</span>
        </summary>
        <div className="px-6 pb-5 pt-3 border-t border-gray-100">
          <ActionForm
            action={createGroup}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Название группы
              </label>
              <input
                name="name"
                placeholder="Например, IELTS 17:00"
                required
                className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Расписание
              </label>
              <select
                name="schedule"
                required
                className="h-10 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="MWF">Пн–Ср–Пт</option>
                <option value="TTS">Вт–Чт–Сб</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Начало
              </label>
              <input
                type="time"
                name="startTime"
                required
                className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Окончание
              </label>
              <input
                type="time"
                name="endTime"
                required
                className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="col-span-2 sm:col-span-3 space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Курс
              </label>
              <select
                name="programId"
                required
                defaultValue=""
                className="h-10 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="" disabled>
                  Выберите курс
                </option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="col-span-2 sm:col-span-3 h-10 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
              Создать группу
            </button>
          </ActionForm>
        </div>
      </details>

      {/* Groups list */}
      {myGroupsFull.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
          Групп пока нет. Создайте первую группу выше.
        </div>
      ) : (
        <div className="space-y-3">
          {myGroupsFull.map((group) => (
            <div
              key={group.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-bold text-gray-900">{group.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {group.schedule} · {group.startTime}–{group.endTime} ·{" "}
                    {group.program?.name} · {group._count.students} students
                  </p>
                </div>
                <ActionForm action={deleteGroup}>
                  <input type="hidden" name="id" value={group.id} />
                  <button
                    type="submit"
                    className="h-8 px-3 rounded-xl text-xs font-semibold border"
                    style={{
                      background: "#fff1f2",
                      color: "#f43f5e",
                      borderColor: "#fecdd3",
                    }}
                  >
                    В архив
                  </button>
                </ActionForm>
              </div>
              <div className="px-6 py-3 border-t border-dashed border-gray-100 bg-gray-50/50">
                <ActionForm
                  action={updateGroup}
                  className="flex gap-2 flex-wrap items-center"
                >
                  <input type="hidden" name="id" value={group.id} />
                  <input
                    name="name"
                    defaultValue={group.name}
                    className="h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 flex-1 min-w-[140px]"
                  />
                  <select
                    name="schedule"
                    defaultValue={group.schedule}
                    className="h-9 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="MWF">Пн–Ср–Пт</option>
                    <option value="TTS">Вт–Чт–Сб</option>
                  </select>
                  <input
                    type="time"
                    name="startTime"
                    defaultValue={group.startTime}
                    className="h-9 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <input
                    type="time"
                    name="endTime"
                    defaultValue={group.endTime}
                    className="h-9 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                  <button
                    type="submit"
                    className="h-9 px-4 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition"
                  >
                    Сохранить
                  </button>
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MY STUDENTS ───────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-xl font-bold text-gray-900">Мои ученики</h2>
        <p className="text-sm text-gray-500 mt-1">{students.length} students</p>
      </div>

      <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50 transition list-none flex items-center justify-between">
          <span>+ Добавить ученика</span>
          <span className="text-gray-400 text-xs">▼</span>
        </summary>
        <div className="px-6 pb-5 pt-2 border-t border-gray-100">
          <ActionForm
            action={createStudent}
            className="flex gap-3 flex-wrap items-end"
          >
            <div className="flex-1 min-w-[180px] space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Имя
              </label>
              <input
                name="name"
                placeholder="Имя и фамилия ученика"
                required
                className="h-10 w-full border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="w-48 space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Группа
              </label>
              <select
                name="groupId"
                required
                defaultValue=""
                className="h-10 w-full border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="" disabled>
                  Выберите группу
                </option>
                {myGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="h-10 px-6 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
              Создать
            </button>
          </ActionForm>
        </div>
      </details>

      {students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
          В ваших группах пока нет учеников.
        </div>
      ) : (
        <div className="space-y-3">
          {students.map((student) => {
            const isPaid = student.groups.every((g) =>
              student.payments.some(
                (p) => p.groupId === g.id && p.status === "PAID",
              ),
            );
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
      <Pagination page={page} total={totalStudents} base="/teacher/students" />
    </div>
  );
}
