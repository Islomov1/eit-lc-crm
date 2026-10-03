import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import { ActionForm } from "@/components/ActionForm";
import { pageNumber } from "@/lib/format";
import { saveStudent } from "./actions";
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const groupId = sp.groupId || "";
  const archived = sp.archived === "1";
  const page = pageNumber(sp.page);
  const where: Prisma.StudentWhereInput = {
    archivedAt: archived ? { not: null } : null,
    ...(groupId ? { groups: { some: { id: groupId } } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            {
              parents: {
                some: {
                  OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { phone: { contains: q } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };
  const [students, total, groups] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 30,
      skip: (page - 1) * 30,
      include: {
        groups: { select: { id: true, name: true } },
        parents: {
          select: { id: true, name: true, phone: true, telegramId: true },
        },
      },
    }),
    prisma.student.count({ where }),
    prisma.group.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">УЧЕБНЫЙ ЦЕНТР</div>
          <h1>Ученики</h1>
          <p>Контакты, группы и вся история обучения.</p>
        </div>
        <Link
          className="btn secondary"
          href={archived ? "/admin/students" : "/admin/students?archived=1"}
        >
          {archived ? "Активные ученики" : "Открыть архив"}
        </Link>
      </header>
      <form className="filters">
        <input
          name="q"
          aria-label="Поиск учеников"
          defaultValue={q}
          placeholder="Имя или телефон ученика / родителя"
        />
        <input type="hidden" name="archived" value={archived ? "1" : "0"} />
        <select name="groupId" defaultValue={groupId} aria-label="Группа">
          <option value="">Все группы</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button className="btn">Найти</button>
      </form>
      {!archived && (
        <details className="panel" style={{ marginBottom: 24 }}>
          <summary className="details-summary">
            <h2>Добавить ученика</h2>
          </summary>
          <ActionForm action={saveStudent} className="form-grid">
            <label className="field">
              <span>ФИО</span>
              <input name="name" required maxLength={255} />
            </label>
            <label className="field">
              <span>Телефон ученика</span>
              <input name="phone" type="tel" maxLength={50} />
            </label>
            <label className="field">
              <span>Группы (можно выбрать несколько)</span>
              <select name="groupIds" multiple size={4}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Заметка</span>
              <textarea name="note" rows={4} />
            </label>
            <button className="btn">Создать карточку →</button>
          </ActionForm>
        </details>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ученик</th>
              <th>Группы</th>
              <th>Контакты родителей</th>
              <th>Карточка</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={"/admin/students/" + s.id}>
                    <strong>{s.name}</strong>
                  </Link>
                  <p className="muted">{s.phone || "Телефон не указан"}</p>
                </td>
                <td>
                  {s.groups.map((g) => (
                    <span key={g.id} className="badge" style={{ margin: 3 }}>
                      {g.name}
                    </span>
                  ))}
                </td>
                <td>
                  {s.parents.map((p) => (
                    <p key={p.id}>
                      {p.name} · {p.phone}{" "}
                      {p.telegramId && (
                        <span className="badge green">Telegram</span>
                      )}
                    </p>
                  ))}
                </td>
                <td>
                  <Link
                    className="btn secondary"
                    href={"/admin/students/" + s.id}
                  >
                    Открыть →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!total && <div className="empty">Ученики не найдены</div>}
      </div>
      <Pagination
        page={page}
        total={total}
        base="/admin/students"
        params={{ q, groupId, archived: archived ? "1" : "0" }}
      />
    </>
  );
}
