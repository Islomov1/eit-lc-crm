import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma, GroupStatus } from "@prisma/client";
import Link from "next/link";

export const revalidate = 30;

/* ================= SERVER ACTIONS ================= */

async function createGroup(formData: FormData) {
  "use server";
  const name = formData.get("name")?.toString().trim();
  const schedule = formData.get("schedule")?.toString() as "MWF" | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  const teacherId = formData.get("teacherId")?.toString() || null;
  const programId = formData.get("programId")?.toString();
  if (!name || !schedule || !startTime || !endTime || !programId) return;
  await prisma.group.create({
    data: { name, schedule, startTime, endTime, teacherId, month: 1, programId, status: "ACTIVE" },
  });
  revalidatePath("/admin/groups");
}

async function updateGroup(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const schedule = formData.get("schedule")?.toString() as "MWF" | "TTS";
  const startTime = formData.get("startTime")?.toString();
  const endTime = formData.get("endTime")?.toString();
  const teacherId = formData.get("teacherId")?.toString();
  const status = formData.get("status")?.toString() as GroupStatus;
  if (!id || !name || !schedule || !startTime || !endTime) return;
  await prisma.group.update({
    where: { id },
    data: { name, schedule, startTime, endTime, teacherId: teacherId || null, status },
  });
  revalidatePath("/admin/groups");
}

async function deleteGroup(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  if (!id) return;
  await prisma.student.updateMany({ where: { groupId: id }, data: { groupId: null } });
  await prisma.report.deleteMany({ where: { groupId: id } });
  await prisma.group.delete({ where: { id } });
  revalidatePath("/admin/groups");
}

/* ================= HELPERS ================= */

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : (v ?? "");
}

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  FINISHING: "bg-yellow-100 text-yellow-700",
  EXPIRED: "bg-red-100 text-red-700",
};

type SP = {
  programId?: string | string[];
  q?: string | string[];
  teacherId?: string | string[];
  status?: string | string[];
};

/* ================= PAGE ================= */

export default async function GroupsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  const teacherId = first(sp.teacherId).trim();
  const status = first(sp.status).trim();
  const selectedProgramId = first(sp.programId).trim();
  const q = first(sp.q).trim();

  const where: Prisma.GroupWhereInput = {};
  if (teacherId === "none") where.teacherId = null;
  else if (teacherId) where.teacherId = teacherId;
  if (selectedProgramId) where.programId = selectedProgramId;
  if (status) where.status = status as GroupStatus;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { teacher: { name: { contains: q, mode: "insensitive" } } },
      { program: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  // ✅ Параллельные запросы
  const [groups, programs, teachers] = await Promise.all([
    prisma.group.findMany({
      where,
      include: { teacher: true, students: true, program: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "TEACHER" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-8 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900">Groups Management</h1>

      {/* FILTERS */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold text-gray-900">
            Filters
            <span className="ml-2 text-sm font-normal text-gray-400">{groups.length} groups</span>
          </h2>
          <div className="flex gap-2 flex-wrap">
            {q && <Chip label={`Search: ${q}`} />}
            {status && <Chip label={`Status: ${status}`} />}
            {teacherId && teacherId !== "none" && <Chip label="Teacher filtered" />}
          </div>
        </div>

        <form method="GET" className="flex flex-wrap gap-3">
          <input
            name="q"
            placeholder="Search group / teacher / program"
            defaultValue={q}
            className="h-11 px-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[220px]"
          />
          <select name="programId" defaultValue={selectedProgramId} className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="teacherId" defaultValue={teacherId} className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">All teachers</option>
            <option value="none">No teacher</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select name="status" defaultValue={status} className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">All status</option>
            <option value="NEW">NEW</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="FINISHING">FINISHING</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>
          <button type="submit" className="h-11 px-6 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition">
            Apply
          </button>
          <Link href="/admin/groups" className="h-11 px-6 flex items-center rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
            Reset
          </Link>
        </form>
      </div>

      {/* CREATE GROUP */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Create Group</h2>
        <form action={createGroup} className="grid grid-cols-6 gap-4">
          <input name="name" placeholder="Group name" required className="col-span-2 h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <select name="schedule" required className="h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="MWF">Mon-Wed-Fri</option>
            <option value="TTS">Tue-Thu-Sat</option>
          </select>
          <select name="programId" required defaultValue="" className="col-span-2 h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="" disabled>Select program</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="time" name="startTime" required className="h-11 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <input type="time" name="endTime" required className="h-11 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <select name="teacherId" defaultValue="" className="col-span-2 h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">No teacher</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="col-span-6 h-11 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 transition">
            Create Group
          </button>
        </form>
      </div>

      {/* GROUP LIST */}
      <div className="space-y-4">
        {groups.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-sm text-gray-400">
            No groups found.
          </div>
        )}

        {groups.map((group) => (
          <div key={group.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-900">{group.name}</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[group.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {group.status}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>Program: {group.program?.name ?? "—"}</span>
                <span>{group.students.length} students</span>
                <form action={deleteGroup}>
                  <input type="hidden" name="id" value={group.id} />
                  <button className="px-3 py-1.5 rounded-xl bg-red-100 text-red-600 text-xs font-semibold hover:bg-red-200 transition">
                    Delete
                  </button>
                </form>
              </div>
            </div>

            {/* Update form */}
            <form action={updateGroup} className="grid grid-cols-6 gap-3">
              <input type="hidden" name="id" value={group.id} />
              <input name="name" defaultValue={group.name} className="col-span-2 h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <select name="schedule" defaultValue={group.schedule} className="h-10 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="MWF">MWF</option>
                <option value="TTS">TTS</option>
              </select>
              <input type="time" name="startTime" defaultValue={group.startTime} className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <input type="time" name="endTime" defaultValue={group.endTime} className="h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <select name="teacherId" defaultValue={group.teacherId || ""} className="h-10 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">No teacher</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select name="status" defaultValue={group.status} className="col-span-2 h-10 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="NEW">NEW</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="FINISHING">FINISHING</option>
                <option value="EXPIRED">EXPIRED</option>
              </select>
              <button className="col-span-4 h-10 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition">
                Save Changes
              </button>
            </form>

            {/* Students list */}
            {group.students.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Students</p>
                <div className="flex flex-wrap gap-2">
                  {group.students.map((s) => (
                    <span key={s.id} className="px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-700">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
      {label}
    </span>
  );
}