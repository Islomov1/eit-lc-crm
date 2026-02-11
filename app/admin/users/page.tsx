import { prisma } from "@/src/lib/prisma";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";

/* ================= CREATE USER ================= */
import type { Prisma } from "@prisma/client";

async function updateUser(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString();
  const email = formData.get("email")?.toString();
  const role = formData.get("role")?.toString() as
    | "ADMIN"
    | "TEACHER"
    | "SUPPORT";
  const password = formData.get("password")?.toString();

  if (!id || !name || !email || !role) return;

  const data: Prisma.UserUpdateInput = {
    name,
    email,
    role,
  };

  if (password && password.length > 0) {
    const hashedPassword = await bcrypt.hash(password, 10);
    data.password = hashedPassword;
  }

  await prisma.user.update({
    where: { id },
    data,
  });

  revalidatePath("/admin/users");
}
async function deleteUser(formData: FormData) {
  "use server";

  const id = formData.get("id")?.toString();
  if (!id) return;

  await prisma.user.delete({
    where: { id },
  });

  revalidatePath("/admin/users");
}
async function createUser(formData: FormData) {
  "use server";

  const name = formData.get("name")?.toString();
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();
  const role = formData.get("role")?.toString() as
    | "ADMIN"
    | "TEACHER"
    | "SUPPORT";

  if (!name || !email || !password || !role) return;

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role,
    },
  });

  revalidatePath("/admin/users");
}

/* ================= PAGE ================= */

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-10">

      <h1 className="text-2xl font-bold">
        Users
      </h1>

      {/* CREATE FORM */}
      <div className="bg-white p-6 rounded-2xl shadow space-y-4">
        <h2 className="font-semibold text-lg">
          Create User
        </h2>

        <form
          action={createUser}
          className="grid grid-cols-4 gap-4"
        >
          <input
            name="name"
            placeholder="Name"
            required
            className="border p-2 rounded"
          />

          <input
            name="email"
            placeholder="Email"
            required
            className="border p-2 rounded"
          />

          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            className="border p-2 rounded"
          />

          <select
            name="role"
            required
            className="border p-2 rounded"
          >
            <option value="TEACHER">
              Teacher
            </option>
            <option value="SUPPORT">
              Support
            </option>
            <option value="ADMIN">
              Admin
            </option>
          </select>

          <button className="col-span-4 bg-black text-white py-2 rounded-lg hover:opacity-80">
            Create User
          </button>
        </form>
      </div>

      {/* USERS TABLE */}
      <div className="bg-white rounded-2xl shadow p-6">
        <table className="w-full text-sm">
          <thead> 
            <tr className="border-b text-left">
              <th className="pb-3">Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>

         <tbody>
  {users.map((user) => (
    <tr
      key={user.id}
      className="border-b hover:bg-gray-50"
    >
      <td className="py-3">
        <form
          action={updateUser}
          className="grid grid-cols-5 gap-3 items-center"
        >
          <input
            type="hidden"
            name="id"
            value={user.id}
          />

          <input
            name="name"
            defaultValue={user.name}
            className="border p-1 rounded text-sm"
          />

          <input
            name="email"
            defaultValue={user.email}
            className="border p-1 rounded text-sm"
          />

          <select
            name="role"
            defaultValue={user.role}
            className="border p-1 rounded text-sm"
          >
            <option value="ADMIN">
              Admin
            </option>
            <option value="TEACHER">
              Teacher
            </option>
            <option value="SUPPORT">
              Support
            </option>
          </select>

          <input
            name="password"
            placeholder="New password (optional)"
            className="border p-1 rounded text-sm"
          />

          <button className="text-blue-600 text-sm hover:underline">
            Save
          </button>
        </form>
      </td>

      <td className="text-right">
        <form action={deleteUser}>
          <input
            type="hidden"
            name="id"
            value={user.id}
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