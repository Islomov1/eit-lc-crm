import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { textField } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { ActionForm } from "@/components/ActionForm";
const roles: Record<string, string> = {
  DIRECTOR: "Директор",
  ADMIN: "Администратор",
  TEACHER: "Преподаватель",
  SUPPORT: "Поддержка",
};
async function saveUser(f: FormData) {
  "use server";
  const actor = await requireRole("DIRECTOR");
  const id = textField(f, "id");
  const name = textField(f, "name");
  const email = textField(f, "email").toLowerCase();
  const password = String(f.get("password") || "");
  const role = textField(f, "role") as Role;
  if (
    !name ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    !Object.values(Role).includes(role)
  )
    throw new Error("Проверьте имя, email и роль");
  if ((!id || password) && (password.length < 8 || password.length > 72))
    throw new Error("Пароль должен содержать от 8 до 72 символов");
  const hash = password ? await bcrypt.hash(password, 12) : undefined;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE role='DIRECTOR' ORDER BY id FOR UPDATE`;
    const old = id ? await tx.user.findUniqueOrThrow({ where: { id } }) : null;
    if (id === actor.id && role !== "DIRECTOR")
      throw new Error("Нельзя снять собственную роль директора");
    if (
      await tx.user.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          ...(id ? { id: { not: id } } : {}),
        },
      })
    )
      throw new Error("Этот email уже занят");
    const row = id
      ? await tx.user.update({
          where: { id },
          data: { name, email, role, ...(hash ? { password: hash } : {}) },
        })
      : await tx.user.create({ data: { name, email, role, password: hash! } });
    if (old && (hash || old.role !== role))
      await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: id ? "UPDATE" : "CREATE",
        entity: "User",
        entityId: row.id,
        summary: `${name}: ${roles[role]}${hash ? " · пароль обновлён" : ""}`,
      },
    });
  });
  revalidatePath("/admin/users");
}
async function disableUser(f: FormData) {
  "use server";
  const actor = await requireRole("DIRECTOR");
  const id = textField(f, "id");
  const restore = f.get("restore") === "1";
  if (id === actor.id) throw new Error("Нельзя отключить свой аккаунт");
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE role='DIRECTOR' ORDER BY id FOR UPDATE`;
    const row = await tx.user.update({
      where: { id },
      data: { disabledAt: restore ? null : new Date() },
    });
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: restore ? "ENABLE" : "DISABLE",
        entity: "User",
        entityId: id,
        summary: `${restore ? "Включён" : "Отключён"} аккаунт ${row.name}`,
      },
    });
  });
  revalidatePath("/admin/users");
}
export default async function UsersPage() {
  await requireRole("DIRECTOR");
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, disabledAt: true },
    orderBy: { name: "asc" },
  });
  function fields(u?: (typeof users)[number]) {
    return (
      <>
        <input name="id" type="hidden" value={u?.id || ""} />
        <label className="field">
          <span>Имя</span>
          <input
            name="name"
            defaultValue={u?.name || ""}
            required
            maxLength={255}
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            defaultValue={u?.email || ""}
            required
          />
        </label>
        <label className="field">
          <span>
            {u ? "Новый пароль (оставьте пустым, чтобы сохранить)" : "Пароль"}
          </span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required={!u}
          />
        </label>
        <label className="field">
          <span>Роль</span>
          <select name="role" defaultValue={u?.role || "TEACHER"}>
            {Object.entries(roles).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button className="btn">{u ? "Сохранить" : "Создать аккаунт"}</button>
      </>
    );
  }
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">КОМАНДА EIT</div>
          <h1>Сотрудники</h1>
          <p>Доступы и роли. Отключение сохраняет все отчёты сотрудника.</p>
        </div>
      </header>
      <details className="panel" style={{ marginBottom: 24 }}>
        <summary className="details-summary">
          <h2>Новый сотрудник</h2>
        </summary>
        <ActionForm action={saveUser} className="form-grid">
          {fields()}
        </ActionForm>
      </details>
      <div className="stack">
        {users.map((u) => (
          <details className="panel" key={u.id}>
            <summary className="details-summary">
              <div>
                <strong>{u.name}</strong>
                <p className="muted">{u.email}</p>
              </div>
              <span className={"badge " + (u.disabledAt ? "red" : "blue")}>
                {u.disabledAt ? "Отключён" : roles[u.role]}
              </span>
            </summary>
            <ActionForm action={saveUser} className="form-grid">
              {fields(u)}
            </ActionForm>
            <ActionForm action={disableUser} className="filters">
              <input name="id" type="hidden" value={u.id} />
              <input
                name="restore"
                type="hidden"
                value={u.disabledAt ? "1" : "0"}
              />
              <button className="btn secondary" style={{ marginTop: 16 }}>
                {u.disabledAt ? "Включить аккаунт" : "Отключить доступ"}
              </button>
            </ActionForm>
          </details>
        ))}
      </div>
    </>
  );
}
