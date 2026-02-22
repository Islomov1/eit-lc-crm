import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";

/* ================= UPDATE USER ================= */

async function updateUser(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString();
  const email = formData.get("email")?.toString();
  const role = formData.get("role")?.toString() as "ADMIN" | "TEACHER" | "SUPPORT";
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

/* ================= DELETE USER ================= */

async function deleteUser(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  // Block delete if referenced (safe for now)
  const [groups, reports, sessions, invites] = await Promise.all([
    prisma.group.count({ where: { teacherId: id } }),
    prisma.report.count({ where: { teacherId: id } }),
    prisma.supportSession.count({ where: { supportId: id } }),
    prisma.parentInvite.count({ where: { createdById: id } }),
  ]);

  if (groups > 0 || reports > 0 || sessions > 0 || invites > 0) {
    console.error("DELETE_USER_BLOCKED_REFERENCES", { id, groups, reports, sessions, invites });
    return;
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (e) {
    console.error("DELETE_USER_ERROR:", e);
  }

  revalidatePath("/admin/users");
}

/* ================= CREATE USER ================= */

async function createUser(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const role = formData.get("role")?.toString() as "ADMIN" | "TEACHER" | "SUPPORT";

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

/* ================= PAGE ================= */

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Users</h1>

      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <h2 className="font-semibold text-lg">Create User</h2>

        <form action={createUser} className="grid grid-cols-4 gap-4">
          <input name="name" placeholder="Name" required className="border p-2 rounded" />
          <input name="email" placeholder="Email" required className="border p-2 rounded" />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            className="border p-2 rounded"
          />

          <select name="role" required className="border p-2 rounded">
            <option value="TEACHER">Teacher</option>
            <option value="SUPPORT">Support</option>
            <option value="ADMIN">Admin</option>
          </select>

          <button className="col-span-4 bg-black text-white py-2 rounded-lg hover:opacity-80">
            Create User
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-3">Name</th>
              <th className="pb-3">Email</th>
              <th className="pb-3">Role</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b hover:bg-gray-50">
                <td className="py-3">
                  <form action={updateUser} className="flex items-center gap-3">
                    <input type="hidden" name="id" value={user.id} />
                    <input
                      name="name"
                      defaultValue={user.name}
                      className="border p-1 rounded text-sm"
                    />
                    {/* keep the rest in other cells */}
                  </form>
                </td>

                <td>
                  <form action={updateUser} className="flex items-center gap-3">
                    <input type="hidden" name="id" value={user.id} />
                    <input
                      name="email"
                      defaultValue={user.email}
                      className="border p-1 rounded text-sm"
                    />
                    {/* hidden fields will be added below via a single form approach */}
                  </form>
                </td>

                <td>
                  <form action={updateUser} className="flex items-center gap-3">
                    <input type="hidden" name="id" value={user.id} />
                    <select
                      name="role"
                      defaultValue={user.role}
                      className="border p-1 rounded text-sm"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="TEACHER">Teacher</option>
                      <option value="SUPPORT">Support</option>
                    </select>
                  </form>
                </td>

                <td className="py-3">
                  {/* One proper form for update + delete */}
                  <div className="flex items-center gap-4">
                    <form action={updateUser} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="name" value={user.name} />
                      <input type="hidden" name="email" value={user.email} />
                      <input type="hidden" name="role" value={user.role} />

                      <input
                        name="password"
                        placeholder="New password (optional)"
                        className="border p-1 rounded text-sm"
                      />
                      <button className="text-blue-600 text-sm hover:underline">Save</button>
                    </form>

                    <form action={deleteUser}>
                      <input type="hidden" name="id" value={user.id} />
                      <button className="text-red-500 hover:underline text-sm">Delete</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-gray-500 mt-4">
          Note: User delete is blocked if the user is linked to groups/reports/support sessions/invites.
        </p>
      </div>
    </div>
  );
}
