import { prisma } from "@/src/lib/prisma";
import { revalidatePath } from "next/cache";

/* ================= CREATE GROUP ================= */
async function updateGroup(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString();
  const schedule = formData.get("schedule")?.toString() as
    | "MWF"
    | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  const teacherId = formData.get("teacherId")?.toString();

  if (!id || !name || !schedule || !startTime || !endTime) return;

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
async function deleteGroup(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  // Сначала убираем студентов из группы
  await prisma.student.updateMany({
    where: { groupId: id },
    data: { groupId: null },
  });

  // Удаляем отчёты группы
  await prisma.report.deleteMany({
    where: { groupId: id },
  });

  // Удаляем саму группу
  await prisma.group.delete({
    where: { id },
  });

  revalidatePath("/admin/groups");
}
async function createGroup(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString();
  const schedule = formData.get("schedule")?.toString() as
    | "MWF"
    | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  const teacherId = formData.get("teacherId")?.toString();

  if (!name || !schedule || !startTime || !endTime) return;

  await prisma.group.create({
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

/* ================= PAGE ================= */

export default async function GroupsPage() {
  const groups = await prisma.group.findMany({
    include: {
      teacher: true,
      students: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER" },
  });

  return (
    <div className="space-y-10">

      {/* TITLE */}
      <h1 className="text-2xl font-bold">
        Groups
      </h1>

      {/* CREATE FORM */}
      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <h2 className="font-semibold text-lg">
          Create Group
        </h2>

        <form
          action={createGroup}
          className="grid grid-cols-5 gap-4"
        >
          <input
            name="name"
            placeholder="Group name"
            required
            className="border p-2 rounded"
          />

          <select
            name="schedule"
            required
            className="border p-2 rounded"
          >
            <option value="MWF">
              Mon-Wed-Fri
            </option>
            <option value="TTS">
              Tue-Thu-Sat
            </option>
          </select>

          <input
            type="time"
            name="startTime"
            required
            className="border p-2 rounded"
          />

          <input
            type="time"
            name="endTime"
            required
            className="border p-2 rounded"
          />

          <select
            name="teacherId"
            className="border p-2 rounded"
          >
            <option value="">
              No teacher
            </option>
            {teachers.map((teacher) => (
              <option
                key={teacher.id}
                value={teacher.id}
              >
                {teacher.name}
              </option>
            ))}
          </select>

          <button className="col-span-5 bg-black text-white py-2 rounded-lg hover:opacity-80 transition">
            Create Group
          </button>
        </form>
      </div>

      {/* GROUPS TABLE */}
      <div className="bg-white rounded-2xl shadow p-6">
        <table className="w-full text-sm">
          <thead>
            <th></th>
            <tr className="border-b text-left">
              <th className="pb-3">Name</th>
              <th>Schedule</th>
              <th>Time</th>
              <th>Teacher</th>
              <th>Students</th>
            </tr>
          </thead>

         <tbody>
  {groups.map((group) => (
    <tr
      key={group.id}
      className="border-b hover:bg-gray-50"
    >
      <td className="py-3">
        <form
          action={updateGroup}
          className="grid grid-cols-6 gap-3 items-center"
        >
          <input
            type="hidden"
            name="id"
            value={group.id}
          />

          <input
            name="name"
            defaultValue={group.name}
            className="border p-1 rounded text-sm"
          />

          <select
            name="schedule"
            defaultValue={group.schedule}
            className="border p-1 rounded text-sm"
          >
            <option value="MWF">
              Mon-Wed-Fri
            </option>
            <option value="TTS">
              Tue-Thu-Sat
            </option>
          </select>

          <input
            type="time"
            name="startTime"
            defaultValue={group.startTime}
            className="border p-1 rounded text-sm"
          />

          <input
            type="time"
            name="endTime"
            defaultValue={group.endTime}
            className="border p-1 rounded text-sm"
          />

          <select
            name="teacherId"
            defaultValue={group.teacherId || ""}
            className="border p-1 rounded text-sm"
          >
            <option value="">
              No teacher
            </option>

            {teachers.map((teacher) => (
              <option
                key={teacher.id}
                value={teacher.id}
              >
                {teacher.name}
              </option>
            ))}
          </select>

          <button className="text-blue-600 text-sm hover:underline">
            Save
          </button>
        </form>
      </td>

      <td className="text-right">
        <form action={deleteGroup}>
          <input
            type="hidden"
            name="id"
            value={group.id}
          />
          <button className="text-red-500 hover:underline text-sm">
            Delete
          </button>
        </form>
      </td>
    </tr>
  ))}
</tbody>
        </table>
      </div>

    </div>
  );
}