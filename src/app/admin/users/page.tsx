import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";

/* ================= SERVER ACTIONS ================= */

async function createUser(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();
  const role = formData.get("role")?.toString() as "ADMIN" | "DIRECTOR" | "TEACHER" | "SUPPORT";

  if (!name || !email || !password || !role) return;

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    await prisma.user.create({
      data: { name, email, password: hashedPassword, role },
    });
  } catch (e) {
    console.error("CREATE_USER_ERROR:", e);
  }

  revalidatePath("/admin/users");
}

async function updateUser(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const role = formData.get("role")?.toString() as "ADMIN" | "DIRECTOR" | "TEACHER" | "SUPPORT";
  const password = formData.get("password")?.toString();

  if (!id || !name || !email || !role) return;

  const data: Prisma.UserUpdateInput = { name, email, role };

  if (password && password.trim().length > 0) {
    data.password = await bcrypt.hash(password, 10);
  }

  try {
    await prisma.user.update({ where: { id }, data });
  } catch (e) {
    console.error("UPDATE_USER_ERROR:", e);
  }

  revalidatePath("/admin/users");
}

async function deleteUser(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  const [groups, reports, sessions, invites] = await Promise.all([
    prisma.group.count({ where: { teacherId: id } }),
    prisma.report.count({ where: { teacherId: id } }),
    prisma.supportSession.count({ where: { supportId: id } }),
    prisma.parentInvite.count({ where: { createdById: id } }),
  ]);

  if (groups > 0 || reports > 0 || sessions > 0 || invites > 0) {
    console.error("DELETE_USER_BLOCKED", { id, groups, reports, sessions, invites });
    return;
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (e) {
    console.error("DELETE_USER_ERROR:", e);
  }

  revalidatePath("/admin/users");
}

/* ================= HELPERS ================= */

const ROLE_COLORS: Record<string, string> = {
  DIRECTOR: "bg-purple-100 text-purple-700",
  ADMIN: "bg-blue-100 text-blue-700",
  TEACHER: "bg-green-100 text-green-700",
  SUPPORT: "bg-orange-100 text-orange-700",
};

/* ================= PAGE ================= */

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  const directors = users.filter((u) => u.role === "DIRECTOR");
  const admins = users.filter((u) => u.role === "ADMIN");
  const teachers = users.filter((u) => u.role === "TEACHER");
  const supports = users.filter((u) => u.role === "SUPPORT");

  return (
    <div className="space-y-10 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">
          {users.length} total · {directors.length} director · {admins.length} admin · {teachers.length} teacher · {supports.length} support
        </p>
      </div>

      {/* ===== CREATE USER ===== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Create New User</h2>

        <form action={createUser} className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Full Name</label>
            <input
              name="name"
              placeholder="e.g. Jasmine Sultonova"
              required
              className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</label>
            <input
              name="email"
              type="email"
              placeholder="email@eitlc.uz"
              required
              className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Password</label>
            <input
              name="password"
              type="password"
              placeholder="Minimum 8 characters"
              required
              minLength={8}
              className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Role</label>
            <select
              name="role"
              required
              className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="DIRECTOR">Director</option>
              <option value="ADMIN">Admin</option>
              <option value="TEACHER">Teacher</option>
              <option value="SUPPORT">Support</option>
            </select>
          </div>

          <button className="col-span-2 h-11 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 active:scale-[0.99] transition">
            Create User
          </button>
        </form>
      </div>

      {/* ===== USERS TABLE ===== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">All Users</h2>
        </div>

        {users.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No users yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {users.map((user) => (
              <div key={user.id} className="px-6 py-5">

                {/* User header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  <span className={`ml-auto text-xs font-semibold px-3 py-1 rounded-full ${ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-600"}`}>
                    {user.role}
                  </span>
                </div>

                {/* Update form */}
                <form action={updateUser} className="grid grid-cols-2 gap-3">
                  <input type="hidden" name="id" value={user.id} />

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">Name</label>
                    <input
                      name="name"
                      defaultValue={user.name}
                      required
                      className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">Email</label>
                    <input
                      name="email"
                      defaultValue={user.email}
                      required
                      className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">Role</label>
                    <select
                      name="role"
                      defaultValue={user.role}
                      className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      <option value="DIRECTOR">Director</option>
                      <option value="ADMIN">Admin</option>
                      <option value="TEACHER">Teacher</option>
                      <option value="SUPPORT">Support</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400">
                      New Password <span className="text-gray-300">(leave blank to keep)</span>
                    </label>
                    <input
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  <div className="col-span-2 flex items-center justify-between pt-1">
                    <button
                      type="submit"
                      className="h-9 px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.99] transition"
                    >
                      Save Changes
                    </button>
                    <button
                      type="submit"
                      formAction={deleteUser}
                      className="h-9 px-5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 active:scale-[0.99] transition"
                    >
                      Delete User
                    </button>
                  </div>
                </form>
              </div>
            ))}
          </div>
        )}

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Delete is blocked if the user is linked to groups, reports, support sessions, or invites.
          </p>
        </div>
      </div>
    </div>
  );
}