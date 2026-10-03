import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, GroupStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { textField, pageNumber, money } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import Pagination from "@/components/Pagination";
import Link from "next/link";
const statusLabels: Record<string, string> = {
  NEW: "Новая",
  ACTIVE: "Активная",
  FINISHING: "Завершается",
  EXPIRED: "Завершена",
};
async function saveGroup(f: FormData) {
  "use server";
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const name = textField(f, "name");
  const schedule = textField(f, "schedule");
  const startTime = textField(f, "startTime");
  const endTime = textField(f, "endTime");
  const programId = textField(f, "programId");
  const teacherId = textField(f, "teacherId") || null;
  const status = textField(f, "status") || "ACTIVE";
  const monthlyFee = Number(f.get("monthlyFee"));
  if (
    !name ||
    !["MWF", "TTS"].includes(schedule) ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime) ||
    startTime >= endTime ||
    !Object.values(GroupStatus).includes(status as GroupStatus) ||
    !Number.isSafeInteger(monthlyFee) ||
    monthlyFee < 0 ||
    monthlyFee > 1e9
  )
    throw new Error("Проверьте название, время и стоимость");
  if (
    teacherId &&
    !(await prisma.user.findFirst({
      where: { id: teacherId, role: "TEACHER", disabledAt: null },
    }))
  )
    throw new Error("Преподаватель недоступен");
  await prisma.$transaction(async (tx) => {
    const data = {
      name,
      schedule: schedule as "MWF" | "TTS",
      startTime,
      endTime,
      programId,
      teacherId,
      status: status as GroupStatus,
      monthlyFee,
    };
    const old = id ? await tx.group.findUniqueOrThrow({ where: { id } }) : null;
    const g = id
      ? await tx.group.update({ where: { id }, data })
      : await tx.group.create({ data });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: id ? "UPDATE" : "CREATE",
        entity: "Group",
        entityId: g.id,
        summary: `${name}: ${schedule}, ${startTime}–${endTime}; стоимость ${old?.monthlyFee || 0} → ${monthlyFee}`,
      },
    });
  });
  revalidatePath("/admin/groups");
  revalidatePath("/admin");
}
async function archiveGroup(f: FormData) {
  "use server";
  const actor = await requireRole("ADMIN", "DIRECTOR");
  const id = textField(f, "id");
  const restore = f.get("restore") === "1";
  await prisma.$transaction(async (tx) => {
    const g = await tx.group.update({
      where: { id },
      data: { archivedAt: restore ? null : new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: restore ? "RESTORE" : "ARCHIVE",
        entity: "Group",
        entityId: id,
        summary: `${restore ? "Восстановлена" : "Архивирована"} группа ${g.name}`,
      },
    });
  });
  revalidatePath("/admin/groups");
}
export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const q = sp.q || "";
  const page = pageNumber(sp.page);
  const archived = sp.archived === "1";
  const where: Prisma.GroupWhereInput = {
    archivedAt: archived ? { not: null } : null,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(sp.teacherId ? { teacherId: sp.teacherId } : {}),
  };
  const [groups, total, programs, teachers] = await Promise.all([
    prisma.group.findMany({
      where,
      take: 20,
      skip: (page - 1) * 20,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      include: {
        teacher: { select: { name: true } },
        program: { select: { name: true } },
        _count: { select: { students: { where: { archivedAt: null } } } },
      },
    }),
    prisma.group.count({ where }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { role: "TEACHER", disabledAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  function fields(g?: (typeof groups)[number]) {
    return (
      <>
        <input type="hidden" name="id" value={g?.id || ""} />
        <label className="field">
          <span>Название</span>
          <input name="name" defaultValue={g?.name || ""} required />
        </label>
        <label className="field">
          <span>Программа</span>
          <select name="programId" defaultValue={g?.programId || ""} required>
            <option value="" disabled>
              Выберите
            </option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Преподаватель</span>
          <select name="teacherId" defaultValue={g?.teacherId || ""}>
            <option value="">Не назначен</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Дни занятий</span>
          <select name="schedule" defaultValue={g?.schedule || "MWF"}>
            <option value="MWF">Пн / Ср / Пт</option>
            <option value="TTS">Вт / Чт / Сб</option>
          </select>
        </label>
        <label className="field">
          <span>Начало</span>
          <input
            name="startTime"
            type="time"
            defaultValue={g?.startTime || ""}
            required
          />
        </label>
        <label className="field">
          <span>Конец</span>
          <input
            name="endTime"
            type="time"
            defaultValue={g?.endTime || ""}
            required
          />
        </label>
        <label className="field">
          <span>Стоимость месяца, сум</span>
          <input
            name="monthlyFee"
            type="number"
            min={0}
            max={1000000000}
            defaultValue={g?.monthlyFee ?? 750000}
            required
          />
        </label>
        <label className="field">
          <span>Статус</span>
          <select name="status" defaultValue={g?.status || "ACTIVE"}>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button className="btn">{g ? "Сохранить" : "Создать группу"}</button>
      </>
    );
  }
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">ОБУЧЕНИЕ</div>
          <h1>Группы</h1>
          <p>Программы, преподаватели и стоимость занятий.</p>
        </div>
        <Link
          className="btn secondary"
          href={archived ? "/admin/groups" : "/admin/groups?archived=1"}
        >
          {archived ? "Активные группы" : "Архив групп"}
        </Link>
      </header>
      <form className="filters">
        <input
          name="q"
          defaultValue={q}
          placeholder="Название группы"
          aria-label="Группа"
        />
        <input name="archived" type="hidden" value={archived ? "1" : "0"} />
        <select
          name="teacherId"
          defaultValue={sp.teacherId || ""}
          aria-label="Преподаватель"
        >
          <option value="">Все преподаватели</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn">Найти</button>
      </form>
      <details className="panel" style={{ marginBottom: 24 }}>
        <summary className="details-summary">
          <h2>Новая группа</h2>
        </summary>
        <ActionForm action={saveGroup} className="form-grid">
          {fields()}
        </ActionForm>
      </details>
      <div className="stack">
        {groups.map((g) => (
          <details className="panel" key={g.id}>
            <summary className="details-summary">
              <div>
                <strong>{g.name}</strong>
                <p className="muted">
                  {g.program.name} · {g.teacher?.name || "Без преподавателя"}
                </p>
                <small className="muted">
                  {g.schedule === "MWF" ? "Пн / Ср / Пт" : "Вт / Чт / Сб"} ·{" "}
                  {g.startTime}–{g.endTime} · {g._count.students} учеников
                </small>
              </div>
              <div>
                <span className="badge blue">{statusLabels[g.status]}</span>
                <p>{money(g.monthlyFee)}</p>
              </div>
            </summary>
            <ActionForm action={saveGroup} className="form-grid">
              {fields(g)}
            </ActionForm>
            <div className="filters" style={{ marginTop: 20, marginBottom: 0 }}>
              <Link
                className="btn secondary"
                href={"/admin/students?groupId=" + g.id}
              >
                Ученики группы
              </Link>
              <ActionForm action={archiveGroup}>
                <input name="id" type="hidden" value={g.id} />
                <input
                  name="restore"
                  type="hidden"
                  value={archived ? "1" : "0"}
                />
                <button className="btn secondary">
                  {archived ? "Восстановить" : "В архив"}
                </button>
              </ActionForm>
            </div>
          </details>
        ))}
      </div>
      {!groups.length && <p className="empty">Группы не найдены</p>}
      <Pagination
        page={page}
        total={total}
        size={20}
        base="/admin/groups"
        params={{
          q,
          teacherId: sp.teacherId || "",
          archived: archived ? "1" : "0",
        }}
      />
    </>
  );
}
