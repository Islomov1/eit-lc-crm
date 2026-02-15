export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma, GroupStatus } from "@prisma/client";

/* ================= UPDATE GROUP ================= */
async function updateGroup(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString();
  const schedule = formData.get("schedule")?.toString() as
    "MWF" | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  const teacherId = formData.get("teacherId")?.toString();

  if (!id || !name || !schedule || !startTime || !endTime)
    return;

  await prisma.group.update({
    where: { id },
    data: {
      name,
      schedule,
      startTime,
      endTime,
      teacherId: teacherId || null,
    },
  });

  revalidatePath("/admin/groups");
}

/* ================= DELETE GROUP ================= */
async function deleteGroup(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  await prisma.student.updateMany({
    where: { groupId: id },
    data: { groupId: null },
  });

  await prisma.report.deleteMany({
    where: { groupId: id },
  });

  await prisma.group.delete({
    where: { id },
  });

  revalidatePath("/admin/groups");
}

/* ================= CREATE GROUP ================= */
async function createGroup(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString();
  const schedule = formData.get("schedule")?.toString() as "MWF" | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  const teacherId = formData.get("teacherId")?.toString() || null;
  const programId = formData.get("programId")?.toString();

  if (!name || !schedule || !startTime || !endTime || !programId) return;

  await prisma.group.create({
    data: {
      name,
      schedule,
      startTime,
      endTime,
      teacherId,
      month: 1,
      programId,
    },
  });

  revalidatePath("/admin/groups");
}


/* ================= PAGE ================= */

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    programId?: string | string[];
    q?: string | string[];
    teacherId?: string | string[];
    status?: string | string[];
  }>;
}) {

  const sp = await searchParams;
  const teacherIdRaw = sp?.teacherId;
  const teacherId = Array.isArray(teacherIdRaw)
  ? teacherIdRaw[0]
  : (teacherIdRaw || "");
const statusRaw = sp?.status;
const status = Array.isArray(statusRaw) ? statusRaw[0] : (statusRaw || "");


  const selectedProgramIdRaw = sp?.programId;
  const selectedProgramId = Array.isArray(selectedProgramIdRaw)
    ? selectedProgramIdRaw[0]
    : (selectedProgramIdRaw || "");

  const qRaw = sp?.q;
  const q = Array.isArray(qRaw) ? qRaw[0] : (qRaw || "");

const where: Prisma.GroupWhereInput = {};

if (teacherId === "none") where.teacherId = null;
else if (teacherId) where.teacherId = teacherId;

if (teacherId) where.teacherId = teacherId;

if (selectedProgramId) where.programId = selectedProgramId;
if (status) where.status = status as GroupStatus;

if (q) {
  where.name = {
    contains: q,
    mode: "insensitive",
  };
}
const groups = await prisma.group.findMany({
  where,
  include: { teacher: true, students: true, program: true },
  orderBy: { createdAt: "desc" },
});
const programs = await prisma.program.findMany({
  orderBy: { name: "asc" },
});

const teachers = await prisma.user.findMany({
  where: { role: "TEACHER" },
});

  return (
    <div className="space-y-10">

<h1 className="text-2xl font-bold">
  Groups Management
</h1>

      <div className="bg-white p-6 rounded-2xl shadow space-y-3">
  <h2 className="font-semibold text-lg">Filters</h2>
<div className="bg-white p-6 rounded-2xl shadow space-y-5">
  {/* Header */}
  <div className="flex items-center justify-between">
    <h2 className="text-xl font-semibold">Filters</h2>

    <div className="flex flex-wrap gap-2">
      {q && (
        <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold">
          Search: {q}
        </span>
      )}
      {status && (
        <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold">
          Status: {status}
        </span>
      )}
    </div>
  </div>

  {/* Counter */}
  <p className="text-sm text-gray-500">
    Showing <span className="font-semibold text-gray-900">{groups.length}</span>{" "}
    group{groups.length === 1 ? "" : "s"}
  </p>

  {/* Form */}
  <form
  method="GET"
  className="flex flex-wrap items-center gap-3"
>
  {/* Search */}
  <input
    name="q"
    placeholder="Search group name"
    defaultValue={q}
    className="
      h-11
      px-4
      rounded-xl
      border
      bg-white
      min-width-[220px]
      focus:outline-none
      focus:ring-2
      focus:ring-gray-200
    "
  />

  {/* Program */}
  <select
    name="programId"
    defaultValue={selectedProgramId}
    className="h-11 px-4 rounded-xl border bg-white min-width-[180px]"
  >
    <option value="">All programs</option>
    {programs.map((p) => (
      <option key={p.id} value={p.id}>
        {p.name}
      </option>
    ))}
  </select>

  {/* Teacher */}
  <select
    name="teacherId"
    defaultValue={teacherId}
    className="h-11 px-4 rounded-xl border bg-white min-width-[180px]"
  >
    <option value="">All teachers</option>
    <option value="none">No teacher</option>
    {teachers.map((t) => (
      <option key={t.id} value={t.id}>
        {t.name}
      </option>
    ))}
  </select>

  {/* Status */}
  <select
    name="status"
    defaultValue={status}
    className="h-11 px-4 rounded-xl border bg-white min-width-[150px]"
  >
    <option value="">All status</option>
    <option value="NEW">NEW</option>
    <option value="ACTIVE">ACTIVE</option>
    <option value="FINISHING">FINISHING</option>
    <option value="EXPIRED">EXPIRED</option>
  </select>

  {/* Apply */}
  <button
    type="submit"
    className="
      h-11
      px-6
      rounded-xl
      bg-green-600
      text-white
      font-semibold
      hover:opacity-90
      active:scale-[0.98]
      transition
    "
  >
    Apply
  </button>

  {/* Reset */}
  <a
    href="/admin/groups"
    className="
      h-11
      px-6
      flex items-center justify-center
      rounded-xl
      border
      font-semibold
      hover:bg-black
      transition
    "
  >
    Reset
  </a>
</form>
</div>
</div>


      {/* CREATE GROUP */}
      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <h2 className="font-semibold text-lg">
          Create Group
        </h2>

        <form action={createGroup} className="grid grid-cols-6 gap-4">
  <input
    name="name"
    placeholder="Group name"
    required
    className="border p-2 rounded col-span-2"
  />

  <select
    name="schedule"
    required
    className="border p-2 rounded col-span-1"
  >
    <option value="MWF">Mon-Wed-Fri</option>
    <option value="TTS">Tue-Thu-Sat</option>
  </select>

  <select
    name="programId"
    required
    defaultValue=""
    className="border p-2 rounded col-span-2"
  >
    <option value="" disabled>Select program</option>
    {programs.map((p) => (
      <option key={p.id} value={p.id}>{p.name}</option>
    ))}
  </select>

  <input
    type="time"
    name="startTime"
    required
    className="border p-2 rounded col-span-1"
  />

  <input
    type="time"
    name="endTime"
    required
    className="border p-2 rounded col-span-1"
  />

  <select
    name="teacherId"
    className="border p-2 rounded col-span-2"
    defaultValue=""
  >
    <option value="">No teacher</option>
    {teachers.map((teacher) => (
      <option key={teacher.id} value={teacher.id}>
        {teacher.name}
      </option>
    ))}
  </select>

  <button
    className="col-span-6 bg-black text-white py-2 rounded-xl hover:opacity-90 active:scale-[0.99] transition font-semibold"
  >
    Create Group
  </button>
</form>

      </div>

      {/* GROUP LIST */}
      <div className="space-y-6">
        {groups.map((group) => (
          <div
          key={group.id}
            className="bg-white p-6 rounded-2xl shadow space-y-4"
          >

            {/* GROUP HEADER */}
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">
                {group.name}
              </h3>
              <p className="text-sm text-gray-500">
  Program: {group.program?.name || "—"}
</p>


              <form action={deleteGroup}>
                <input
                  type="hidden"
                  name="id"
                  value={group.id}
                />
                <button
  className="px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition"
>
  Delete
</button>

              </form>
            </div>

            {/* UPDATE FORM */}
            <form
              action={updateGroup}
              className="grid grid-cols-6 gap-3"
            >
              <input
                type="hidden"
                name="id"
                value={group.id}
              />

              <input
                name="name"
                defaultValue={group.name}
                className="border p-2 rounded"
              />

              <select
                name="schedule"
                defaultValue={group.schedule}
                className="border p-2 rounded"
              >
                <option value="MWF">MWF</option>
                <option value="TTS">TTS</option>
              </select>

              <input
                type="time"
                name="startTime"
                defaultValue={group.startTime}
                className="border p-2 rounded"
              />

              <input
                type="time"
                name="endTime"
                defaultValue={group.endTime}
                className="border p-2 rounded"
              />

              <select
                name="teacherId"
                defaultValue={group.teacherId || ""}
                className="border p-2 rounded"
              >
                <option value="">No teacher</option>
                {teachers.map((teacher) => (
                  <option
                    key={teacher.id}
                    value={teacher.id}
                  >
                    {teacher.name}
                  </option>
                ))}
              </select>

             <button className="col-span-6 bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700 active:scale-[0.99] transition font-semibold">
  Save Changes
</button>

            </form>

            {/* STUDENTS INSIDE GROUP */}
            <div>
              <h4 className="font-medium mb-2">
                Students
              </h4>

              {group.students.length === 0 && (
                <p className="text-sm text-gray-400">
                  No students assigned
                </p>
              )}

              <div className="space-y-2">
                {group.students.map((student) => (
                  <div
                    key={student.id}
                    className="bg-gray-50 p-2 rounded text-sm"
                  >
                    {student.name}
                  </div>
                ))}
              </div>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
}