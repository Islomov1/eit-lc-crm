import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pageNumber, fmtDate } from "@/lib/format";
import Pagination from "@/components/Pagination";
import Link from "next/link";
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  await requireRole("DIRECTOR");
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const q = sp.q || "";
  const where = q
    ? {
        OR: [
          { summary: { contains: q, mode: "insensitive" as const } },
          { actorName: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      take: 50,
      skip: (page - 1) * 50,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    prisma.auditLog.count({ where }),
  ]);
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">КОНТРОЛЬ И ИСТОРИЯ</div>
          <h1>Журнал действий</h1>
          <p>Кто и когда изменил данные центра.</p>
        </div>
      </header>
      <form className="filters">
        <input
          name="q"
          defaultValue={q}
          placeholder="Сотрудник или изменение"
          aria-label="Поиск по журналу"
        />
        <button className="btn">Найти</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Когда</th>
              <th>Сотрудник</th>
              <th>Изменение</th>
              <th>Объект</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.createdAt)}</td>
                <td>{r.actorName}</td>
                <td>{r.summary}</td>
                <td>
                  {["Student", "Lead"].includes(r.entity) ? (
                    <Link
                      className="badge"
                      href={`/admin/${r.entity === "Student" ? "students" : "leads"}/${r.entityId}`}
                    >
                      Открыть →
                    </Link>
                  ) : (
                    r.entity
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty">Изменений пока нет</p>}
      </div>
      <Pagination
        page={page}
        size={50}
        total={total}
        base="/admin/audit"
        params={{ q }}
      />
    </>
  );
}
