import { prisma } from "@/src/lib/prisma";
import Link from "next/link";
import { AttendanceStatus, HomeworkStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import crypto from "crypto";

/* ================= CREATE STUDENT ================= */

async function createStudent(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString();
  const groupId = formData.get("groupId")?.toString();

  if (!name) return;

  await prisma.student.create({
    data: {
      name,
      groupId: groupId || null,
    },
  });

  revalidatePath("/admin/students");
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function updateReport(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  const attendance = formData.get("attendance")?.toString();
  const homework = formData.get("homework")?.toString();
  const comment = formData.get("comment")?.toString();

  if (!id || !attendance || !homework) return;

  await prisma.report.update({
    where: { id },
    data: {
      attendance: attendance as AttendanceStatus,
      homework: homework as HomeworkStatus,
      comment,
    },
  });

  revalidatePath("/admin/students");
}
/* ================= DELETE STUDENT ================= */

async function deleteStudent(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  await prisma.parent.deleteMany({
    where: { studentId: id },
  });

  await prisma.student.delete({
    where: { id },
  });

  revalidatePath("/admin/students");
}

/* ================= CREATE PARENT ================= */

async function updateParent(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString();
  const phone = formData.get("phone")?.toString();
  const telegramId = formData.get("telegramId")?.toString();

  if (!id || !name || !phone) return;
const tg = telegramId && /^\d+$/.test(telegramId) ? BigInt(telegramId) : null;

await prisma.parent.update({
  where: { id },
  data: {
    name,
    phone,
    telegramId: tg,
  },
});


  revalidatePath("/admin/students");
}
async function createParentInvite(formData: FormData) {
  "use server";

  const studentId = formData.get("studentId")?.toString();
  if (!studentId) return;

  // создаём короткий код
  const code = "eit" + crypto.randomBytes(16).toString("hex").slice(0, 10);

  await prisma.parentInvite.create({
    data: {
      code,
      status: "ACTIVE",
      studentId,
    },
  });

  // перекидываем назад и показываем ссылку сверху
  redirect(`/admin/students?invite=${code}&student=${studentId}`);
}

async function createParent(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString();
  const phone = formData.get("phone")?.toString();
  const telegramId = formData.get("telegramId")?.toString();
  const studentId = formData.get("studentId")?.toString();

  if (!name || !phone || !studentId) return;

  await prisma.parent.create({
    data: {
      name,
      phone,
      telegramId: telegramId ? BigInt(telegramId) : null,
      studentId,
    },
  });

  revalidatePath("/admin/students");
}

/* ================= DELETE PARENT ================= */

async function deleteParent(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  await prisma.parent.delete({
    where: { id },
  });

  revalidatePath("/admin/students");
}
import { revalidatePath } from "next/cache";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function deleteReport(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  await prisma.report.delete({
    where: { id },
  });

  revalidatePath("/admin/students");
}
/* ================= PAGE ================= */

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: { invite?: string; student?: string };
}) {
  const students = await prisma.student.findMany({
  include: {
    group: true,
    parents: true, // ← ВОТ ЭТО ОБЯЗАТЕЛЬНО
  },
  orderBy: { createdAt: "desc" },
});

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
  });
const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
const inviteCode = searchParams.invite;
const inviteStudent = searchParams.student;

const inviteLink: string | null =
  botUsername && inviteCode
    ? `https://t.me/${botUsername}?start=${inviteCode}`
    : null;

  return (
  <div className="space-y-10">

    {inviteLink && (
      <div className="bg-green-50 text-green-800 p-4 rounded-2xl shadow">
        <div className="font-semibold mb-1">Telegram invite link created</div>
        <div className="text-sm break-all">{inviteLink}</div>
        <div className="text-xs text-green-700 mt-2">
          Student ID: {inviteStudent}
        </div>
      </div>
    )}

    <h1 className="text-2xl font-bold">
      Students
    </h1>

    {/* CREATE STUDENT */}

      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <h2 className="font-semibold text-lg">
          Create Student
        </h2>

        <form
          action={createStudent}
          className="grid grid-cols-3 gap-4"
        >
          <input
            name="name"
            placeholder="Student name"
            required
            className="border p-2 rounded"
          />

          <select
            name="groupId"
            className="border p-2 rounded"
          >
            <option value="">
              No group
            </option>

            {groups.map((group) => (
              <option
                key={group.id}
                value={group.id}
              >
                {group.name}
              </option>
            ))}
          </select>

          <button className="bg-black text-white py-2 rounded-lg hover:opacity-80">
            Create Student
          </button>
        </form>
      </div>

      {/* STUDENT CARDS */}
      <div className="space-y-6">
        {students.map((student) => (
          <div
            key={student.id}
            className="bg-white rounded-2xl shadow p-6 space-y-4"
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-lg">
  <Link
    href={`/admin/students/${student.id}`}
    className="text-blue-600 hover:underline"
  >
    {student.name}
  </Link>
</h3>
                <p className="text-sm text-gray-500">
                  Group:{" "}
                  {student.group
                    ? student.group.name
                    : "Not assigned"}
                </p>
              </div>
                  <form action={createParentInvite}>
  <input type="hidden" name="studentId" value={student.id} />
  <button className="text-sm text-black hover:underline">
    Create Telegram link
  </button>
</form>

              <form action={deleteStudent}>
                <input
                  type="hidden"
                  name="id"
                  value={student.id}
                />
                <button className="text-red-500 text-sm hover:underline">
                  Delete student
                </button>
              </form>
            </div>

            {/* Parents */}
            <div>
              <h4 className="font-medium mb-2">
                Parents
              </h4>

              {student.parents.length === 0 && (
                <p className="text-sm text-gray-400">
                  No parents added
                </p>
              )}

              <div className="space-y-2">
                {student.parents.map((parent) => (
               <div
  key={parent.id}
  className="bg-gray-50 p-3 rounded"
>
  <form
  action={updateParent}
  className="grid grid-cols-4 gap-3 items-center bg-gray-50 p-3 rounded"
>
  <input
    type="hidden"
    name="id"
    value={parent.id}
  />

  <input
    name="name"
    defaultValue={parent.name}
    className="border p-2 rounded"
  />

  <input
    name="phone"
    defaultValue={parent.phone}
    className="border p-2 rounded"
  />

  <input
  name="telegramId"
  defaultValue={parent.telegramId ? parent.telegramId.toString() : ""}
  className="border p-2 rounded"
/>


  <div className="col-span-4 flex justify-between mt-2">
    <button
      type="submit"
      className="text-blue-600 text-sm hover:underline"
    >
      Save
    </button>

    <button
      type="submit"
      formAction={deleteParent}
      className="text-red-500 text-sm hover:underline"
    >
      Delete
    </button>
  </div>
</form>
</div>
                ))}
              </div>
            </div>

            {/* Add Parent */}
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-3">
                Add Parent
              </h4>

              <form
                action={createParent}
                className="grid grid-cols-4 gap-3"
              >
                <input
                  type="hidden"
                  name="studentId"
                  value={student.id}
                />

                <input
                  name="name"
                  placeholder="Parent name"
                  required
                  className="border p-2 rounded"
                />

                <input
                  name="phone"
                  placeholder="Phone number"
                  required
                  className="border p-2 rounded"
                />

                <input
                  name="telegramId"
                  placeholder="Telegram username or ID"
                  className="border p-2 rounded"
                />

                <button className="col-span-4 bg-black text-white py-2 rounded-lg hover:opacity-80">
                  Add Parent
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}