import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

/* ================= CREATE STUDENT ================= */

async function createStudent(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString().trim();
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

/* ================= DELETE STUDENT ================= */

async function deleteStudent(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  // Minimal safe delete order (extend later if you add more relations)
  await prisma.parentInvite.deleteMany({ where: { studentId: id } });
  await prisma.telegramDelivery.deleteMany({ where: { studentId: id } });
  await prisma.parent.deleteMany({ where: { studentId: id } });
  await prisma.supportSession.deleteMany({ where: { studentId: id } });
  await prisma.report.deleteMany({ where: { studentId: id } });

  await prisma.student.delete({ where: { id } });

  revalidatePath("/admin/students");
}

/* ================= UPDATE PARENT ================= */

async function updateParent(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();

  if (!id || !name || !phone) return;

  await prisma.parent.update({
    where: { id },
    data: {
      name,
      phone,
      // telegramId is linked by bot (do not edit manually here)
    },
  });

  revalidatePath("/admin/students");
}

/* ================= CREATE PARENT INVITE ================= */

async function createParentInvite(formData: FormData) {
  "use server";

  const studentId = formData.get("studentId")?.toString();
  if (!studentId) return;

  const code = "eit" + crypto.randomBytes(16).toString("hex").slice(0, 10);

  await prisma.parentInvite.create({
    data: {
      code,
      status: "ACTIVE",
      studentId,
    },
  });

  redirect(`/admin/students?invite=${code}&student=${studentId}`);
}

/* ================= CREATE PARENT ================= */

async function createParent(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  const studentId = formData.get("studentId")?.toString();

  if (!name || !phone || !studentId) return;

  await prisma.parent.create({
    data: {
      name,
      phone,
      telegramId: null, // linked later by bot after they start + share phone
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

  await prisma.parent.delete({ where: { id } });

  revalidatePath("/admin/students");
}

/* ================= PAGE ================= */

type SP = Record<string, string | string[] | undefined>;

function spStr(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const q = spStr(sp.q).trim();
  const groupIdFilter = spStr(sp.groupId).trim();

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const students = await prisma.student.findMany({
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
    include: {
      group: true,
      parents: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  const inviteCode = typeof sp.invite === "string" ? sp.invite : undefined;
  const inviteStudent = typeof sp.student === "string" ? sp.student : undefined;

  const inviteLink: string | null =
    botUsername && inviteCode ? `https://t.me/${botUsername}?start=${inviteCode}` : null;

  return (
    <div className="space-y-10">
      {inviteLink && (
        <div className="bg-green-50 text-green-800 p-4 rounded-2xl shadow">
          <div className="font-semibold mb-1">Telegram invite link created</div>
          <div className="text-sm break-all">{inviteLink}</div>
          <div className="text-xs text-green-700 mt-2">Student ID: {inviteStudent}</div>
          <div className="text-xs text-green-700 mt-1">
            Parent must open the bot and share phone number to link.
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold">Students</h1>

      {/* SEARCH / FILTER */}
      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <form className="grid grid-cols-3 gap-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search: student / group / parent / phone"
            className="border p-2 rounded"
          />

          <select name="groupId" defaultValue={groupIdFilter} className="border p-2 rounded">
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <div className="flex gap-3">
            <button className="bg-black text-white py-2 px-4 rounded-lg hover:opacity-80">
              Search
            </button>
            <Link href="/admin/students" className="py-2 text-sm text-gray-600 hover:underline">
              Reset
            </Link>
          </div>
        </form>
      </div>

      {/* CREATE STUDENT */}
      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <h2 className="font-semibold text-lg">Create Student</h2>

        <form action={createStudent} className="grid grid-cols-3 gap-4">
          <input name="name" placeholder="Student name" required className="border p-2 rounded" />

          <select name="groupId" className="border p-2 rounded">
            <option value="">No group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
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
          <div key={student.id} className="bg-white rounded-2xl shadow p-6 space-y-4">
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
                  Group: {student.group ? student.group.name : "Not assigned"}
                </p>
              </div>

              <form action={createParentInvite}>
                <input type="hidden" name="studentId" value={student.id} />
                <button className="text-sm text-black hover:underline">Create Telegram link</button>
              </form>

              <form action={deleteStudent}>
                <input type="hidden" name="id" value={student.id} />
                <button className="text-red-500 text-sm hover:underline">Delete student</button>
              </form>
            </div>

            {/* Parents */}
            <div>
              <h4 className="font-medium mb-2">Parents</h4>

              {student.parents.length === 0 && <p className="text-sm text-gray-400">No parents added</p>}

              <div className="space-y-2">
                {student.parents.map((parent) => {
                  const linked = Boolean(parent.telegramId);
                  return (
                    <div key={parent.id} className="bg-gray-50 p-3 rounded">
                      <form
                        action={updateParent}
                        className="grid grid-cols-4 gap-3 items-center bg-gray-50 p-3 rounded"
                      >
                        <input type="hidden" name="id" value={parent.id} />

                        <input name="name" defaultValue={parent.name} className="border p-2 rounded" />
                        <input name="phone" defaultValue={parent.phone} className="border p-2 rounded" />

                        <div className="border p-2 rounded bg-white text-sm text-gray-700">
                          {linked ? "Linked ✅" : "Not linked ❌"}
                        </div>

                        <div className="col-span-4 flex justify-between mt-2">
                          <div className="text-xs text-gray-600">
                            Telegram chat_id:{" "}
                            {parent.telegramId ? parent.telegramId.toString() : "-"}
                          </div>

                          <div className="flex gap-6">
                            <button type="submit" className="text-blue-600 text-sm hover:underline">
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
                        </div>
                      </form>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add Parent */}
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-3">Add Parent</h4>

              <form action={createParent} className="grid grid-cols-4 gap-3">
                <input type="hidden" name="studentId" value={student.id} />

                <input name="name" placeholder="Parent name" required className="border p-2 rounded" />
                <input name="phone" placeholder="Phone number (+998...)" required className="border p-2 rounded" />

                <div className="border p-2 rounded bg-gray-50 text-sm text-gray-600 flex items-center">
                  Telegram links via bot
                </div>

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
