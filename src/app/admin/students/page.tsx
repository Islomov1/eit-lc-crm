import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { StudentCard } from "@/components/StudentCard";

export const revalidate = 30;

/* ================= SERVER ACTIONS ================= */

async function createStudent(formData: FormData) {
  "use server";
  const name = formData.get("name")?.toString().trim();
  const groupIds = formData.getAll("groupIds").map((v) => v.toString()).filter(Boolean);
  if (!name) return;
  await prisma.student.create({
    data: {
      name,
      groups: groupIds.length > 0 ? { connect: groupIds.map((id) => ({ id })) } : undefined,
    },
  });
  revalidatePath("/admin/students");
}

async function updateStudent(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const groupIds = formData.getAll("groupIds").map((v) => v.toString()).filter(Boolean);
  if (!id || !name) return;
  await prisma.student.update({
    where: { id },
    data: {
      name,
      groups: { set: groupIds.map((gid) => ({ id: gid })) },
    },
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
        ...(groupIdFilter ? { groups: { some: { id: groupIdFilter } } } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { groups: { some: { name: { contains: q, mode: "insensitive" } } } },
                { parents: { some: { name: { contains: q, mode: "insensitive" } } } },
                { parents: { some: { phone: { contains: q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: { groups: true, parents: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
  ]);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const inviteLink =
    botUsername && inviteCode ? `https://t.me/${botUsername}?start=${inviteCode}` : null;

  return (
    <div className="space-y-6 max-w-6xl">

      {/* Invite banner */}
      {inviteLink && (
        <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-2xl space-y-1">
          <p className="font-semibold text-sm">✅ Telegram invite link created</p>
          <p className="text-sm break-all font-mono">{inviteLink}</p>
          <p className="text-xs text-green-600 mt-1">Parent must open the bot and share their phone number to link.</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Students
          <span className="ml-2 text-base font-normal text-gray-400">{students.length}</span>
        </h1>
      </div>

      {/* Search & filter */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <form className="flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name, group, parent, phone…"
            className="flex-1 h-10 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[220px]"
          />
          <select
            name="groupId"
            defaultValue={groupIdFilter}
            className="h-10 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button className="h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
            Search
          </button>
          <Link
            href="/admin/students"
            className="h-10 px-4 flex items-center border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition"
          >
            Reset
          </Link>
        </form>
      </div>

      {/* Create student */}
      <details className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group">
        <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50 transition list-none flex items-center justify-between">
          <span>+ New Student</span>
          <span className="text-gray-400 text-xs group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <div className="px-6 pb-5 pt-2 border-t border-gray-100 space-y-4">
          <form action={createStudent} className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <input
                name="name"
                placeholder="Full name"
                required
                className="flex-1 h-10 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[200px]"
              />
              <button className="h-10 px-6 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
                Create
              </button>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Assign groups</p>
              <GroupPickerImport allGroups={groups} selectedIds={[]} />
            </div>
          </form>
        </div>
      </details>

      {/* Student list */}
      <div className="space-y-3">
        {students.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            No students found.
          </div>
        )}
        {students.map((student) => (
          <StudentCard
            key={student.id}
            student={student}
            allGroups={groups}
            updateStudent={updateStudent}
            deleteStudent={deleteStudent}
            updateParent={updateParent}
            deleteParent={deleteParent}
            createParent={createParent}
            createParentInvite={createParentInvite}
          />
        ))}
      </div>
    </div>
  );
}

// Small wrapper to keep GroupPicker usable in the server page create form
import { GroupPicker as GroupPickerImport } from "@/components/GroupPicker";