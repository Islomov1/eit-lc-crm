import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

export const revalidate = 30;

/* ================= SERVER ACTIONS ================= */

async function createStudent(formData: FormData) {
  "use server";
  const name = formData.get("name")?.toString().trim();
  const groupId = formData.get("groupId")?.toString();
  if (!name) return;
  await prisma.student.create({ data: { name, groupId: groupId || null } });
  revalidatePath("/admin/students");
}

async function updateStudent(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const groupId = formData.get("groupId")?.toString();
  if (!id || !name) return;
  await prisma.student.update({
    where: { id },
    data: { name, groupId: groupId || null },
  });
  revalidatePath("/admin/students");
}

async function deleteStudent(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  if (!id) return;
  await Promise.all([
    prisma.parentInvite.deleteMany({ where: { studentId: id } }),
    prisma.telegramDelivery.deleteMany({ where: { studentId: id } }),
    prisma.report.deleteMany({ where: { studentId: id } }),
    prisma.supportSession.deleteMany({ where: { studentId: id } }),
  ]);
  await prisma.parent.deleteMany({ where: { studentId: id } });
  await prisma.student.delete({ where: { id } });
  revalidatePath("/admin/students");
}

async function updateParent(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  if (!id || !name || !phone) return;
  await prisma.parent.update({ where: { id }, data: { name, phone } });
  revalidatePath("/admin/students");
}

async function createParentInvite(formData: FormData) {
  "use server";
  const studentId = formData.get("studentId")?.toString();
  if (!studentId) return;
  const code = "eit" + crypto.randomBytes(16).toString("hex").slice(0, 10);
  await prisma.parentInvite.create({ data: { code, status: "ACTIVE", studentId } });
  redirect(`/admin/students?invite=${code}&student=${studentId}`);
}

async function createParent(formData: FormData) {
  "use server";
  const name = formData.get("name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  const studentId = formData.get("studentId")?.toString();
  if (!name || !phone || !studentId) return;
  await prisma.parent.create({ data: { name, phone, telegramId: null, studentId } });
  revalidatePath("/admin/students");
}

async function deleteParent(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  if (!id) return;
  await prisma.parent.delete({ where: { id } });
  revalidatePath("/admin/students");
}

/* ================= PAGE ================= */

type SP = Record<string, string | string[] | undefined>;

function spStr(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  const q = spStr(sp.q).trim();
  const groupIdFilter = spStr(sp.groupId).trim();
  const inviteCode = typeof sp.invite === "string" ? sp.invite : undefined;
  const inviteStudent = typeof sp.student === "string" ? sp.student : undefined;

  const [groups, students] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.student.findMany({
      where: {
        ...(groupIdFilter ? { groupId: groupIdFilter } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { group: { name: { contains: q, mode: "insensitive" } } },
                { parents: { some: { name: { contains: q, mode: "insensitive" } } } },
                { parents: { some: { phone: { contains: q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: { group: true, parents: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const inviteLink =
    botUsername && inviteCode ? `https://t.me/${botUsername}?start=${inviteCode}` : null;

  return (
    <div className="space-y-8 max-w-4xl">

      {/* Invite banner */}
      {inviteLink && (
        <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-2xl space-y-1">
          <p className="font-semibold">Telegram invite link created</p>
          <p className="text-sm break-all">{inviteLink}</p>
          <p className="text-xs text-green-600">Student ID: {inviteStudent}</p>
          <p className="text-xs text-green-600">Parent must open the bot and share phone to link.</p>
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-900">
        Students
        <span className="ml-2 text-base font-normal text-gray-400">{students.length} found</span>
      </h1>

      {/* SEARCH */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <form className="flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search: student / group / parent / phone"
            className="flex-1 h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[220px]"
          />
          <select
            name="groupId"
            defaultValue={groupIdFilter}
            className="h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button className="h-11 px-6 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
            Search
          </button>
          <Link
            href="/admin/students"
            className="h-11 px-4 flex items-center border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Reset
          </Link>
        </form>
      </div>

      {/* CREATE STUDENT */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Create Student</h2>
        <form action={createStudent} className="flex gap-3 flex-wrap">
          <input
            name="name"
            placeholder="Student name"
            required
            className="flex-1 h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[200px]"
          />
          <select
            name="groupId"
            className="h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button className="h-11 px-6 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
            Create Student
          </button>
        </form>
      </div>

      {/* STUDENT CARDS */}
      <div className="space-y-4">
        {students.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-400">
            No students found.
          </div>
        )}

        {students.map((student) => (
          <div key={student.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">

            {/* Student header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">
                  <Link href={`/admin/students/${student.id}`} className="hover:text-blue-600 transition">
                    {student.name}
                  </Link>
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Group: <span className="font-medium text-gray-700">{student.group?.name ?? "Not assigned"}</span>
                </p>

                {/* ✅ EDIT STUDENT FORM */}
                <form action={updateStudent} className="flex gap-2 flex-wrap mt-3">
                  <input type="hidden" name="id" value={student.id} />
                  <input
                    name="name"
                    defaultValue={student.name}
                    placeholder="Student name"
                    required
                    className="h-9 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
                  />
                  <select
                    name="groupId"
                    defaultValue={student.groupId ?? ""}
                    className="h-9 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="h-9 px-4 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
                  >
                    Save
                  </button>
                </form>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <form action={createParentInvite}>
                  <input type="hidden" name="studentId" value={student.id} />
                  <button className="h-9 px-4 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition">
                    Telegram link
                  </button>
                </form>
                <form action={deleteStudent}>
                  <input type="hidden" name="id" value={student.id} />
                  <button className="h-9 px-4 rounded-xl bg-red-100 text-red-600 text-sm font-semibold hover:bg-red-200 transition">
                    Delete
                  </button>
                </form>
              </div>
            </div>

            {/* Parents */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Parents</p>

              {student.parents.length === 0 && (
                <p className="text-sm text-gray-400">No parents added yet.</p>
              )}

              {student.parents.map((parent) => (
                <div key={parent.id} className="bg-gray-50 rounded-xl p-4">
                  <form action={updateParent} className="grid grid-cols-2 gap-3">
                    <input type="hidden" name="id" value={parent.id} />
                    <input
                      name="name"
                      defaultValue={parent.name}
                      className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                    />
                    <input
                      name="phone"
                      defaultValue={parent.phone}
                      className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                    />
                    <div className="col-span-2 flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          parent.telegramId
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {parent.telegramId
                          ? `✅ Telegram linked · ${parent.telegramId.toString()}`
                          : "❌ Not linked"}
                      </span>
                      <div className="flex gap-3">
                        <button type="submit" className="text-sm text-blue-600 hover:underline font-medium">
                          Save
                        </button>
                        <button
                          type="submit"
                          formAction={deleteParent}
                          className="text-sm text-red-500 hover:underline font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              ))}
            </div>

            {/* Add parent */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Add Parent</p>
              <form action={createParent} className="flex gap-3 flex-wrap">
                <input type="hidden" name="studentId" value={student.id} />
                <input
                  name="name"
                  placeholder="Parent name"
                  required
                  className="flex-1 h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[150px]"
                />
                <input
                  name="phone"
                  placeholder="+998..."
                  required
                  className="flex-1 h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[150px]"
                />
                <button className="h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
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