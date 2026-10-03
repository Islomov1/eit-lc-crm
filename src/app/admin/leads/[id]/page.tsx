import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { fmtDate, localDateTime } from "@/lib/format";
import { leadLabels, leadColors } from "@/lib/lead-labels";
import { saveLead, addActivity, convertLead, archiveLead } from "../actions";
export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN", "DIRECTOR");
  const { id } = await params;
  const [lead, owners, groups] = await Promise.all([
    prisma.lead.findUnique({
      where: { id },
      include: { activities: { orderBy: { createdAt: "desc" }, take: 50 } },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "DIRECTOR"] }, disabledAt: null },
      select: { id: true, name: true },
    }),
    prisma.group.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!lead) notFound();
  const matches = await prisma.student.findMany({
    where: {
      archivedAt: null,
      OR: [
        { name: { equals: lead.name, mode: "insensitive" } },
        ...(lead.phone ? [{ phone: lead.phone }] : []),
      ],
    },
    select: { id: true, name: true, phone: true },
    take: 20,
  });
  return (
    <>
      <header className="page-header">
        <div>
          <Link className="eyebrow" href="/admin/leads">
            ← ВСЕ ЛИДЫ
          </Link>
          <h1 style={{ marginTop: 12 }}>{lead.name}</h1>
          <p>
            {lead.source || "manual"} · {fmtDate(lead.createdAt)}{" "}
            {lead.archivedAt ? "· В архиве" : ""}
          </p>
        </div>
        <span className={"badge " + leadColors[lead.status]}>
          {leadLabels[lead.status]}
        </span>
      </header>
      <div className="two-col">
        <section className="panel">
          <h2 className="panel-title">Контакты и план работы</h2>
          <ActionForm action={saveLead} className="form-grid">
            <input type="hidden" name="id" value={id} />
            <label className="field">
              <span>Имя</span>
              <input name="name" defaultValue={lead.name} required />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input name="phone" defaultValue={lead.phone || ""} />
            </label>
            <label className="field">
              <span>Курс</span>
              <input name="program" defaultValue={lead.program || ""} />
            </label>
            <label className="field">
              <span>Источник</span>
              <input name="source" defaultValue={lead.source || ""} />
            </label>
            <label className="field">
              <span>Статус</span>
              <select name="status" defaultValue={lead.status}>
                {Object.entries(leadLabels)
                  .filter(([k]) =>
                    lead.studentId ? k === "CONVERTED" : k !== "CONVERTED",
                  )
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Ответственный</span>
              <select name="ownerId" defaultValue={lead.ownerId || ""}>
                <option value="">Не назначен</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Следующий контакт · UTC+5</span>
              <input
                type="datetime-local"
                name="followUpAt"
                defaultValue={localDateTime(lead.followUpAt)}
              />
            </label>
            <label className="field">
              <span>Пробное занятие · UTC+5</span>
              <input
                type="datetime-local"
                name="trialAt"
                defaultValue={localDateTime(lead.trialAt)}
              />
            </label>
            <label className="field wide">
              <span>Причина отказа (обязательно для отказа)</span>
              <input name="lossReason" defaultValue={lead.lossReason || ""} />
            </label>
            <label className="field wide">
              <span>Данные заявки / заметка</span>
              <textarea name="note" rows={5} defaultValue={lead.note || ""} />
            </label>
            <button className="btn">Сохранить</button>
          </ActionForm>
        </section>
        <div className="stack">
          <section className="panel">
            <h2 className="panel-title">Зачисление</h2>
            {lead.studentId ? (
              <Link className="btn" href={"/admin/students/" + lead.studentId}>
                Карточка ученика →
              </Link>
            ) : lead.archivedAt ? (
              <p className="muted">Восстановите лид для зачисления.</p>
            ) : (
              <ActionForm action={convertLead} className="form-grid">
                <input type="hidden" name="id" value={id} />
                <label className="field wide">
                  <span>Группа</span>
                  <select name="groupId" required defaultValue="">
                    <option value="" disabled>
                      Выберите группу
                    </option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                {matches.length > 0 && (
                  <label className="field wide">
                    <span>
                      Найдены похожие ученики — проверьте перед созданием
                    </span>
                    <select name="studentId">
                      <option value="">Создать нового ученика</option>
                      {matches.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.phone || "нет телефона"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p className="muted wide">
                  Имя, телефон и заметки попадут в карточку автоматически.
                </p>
                <button className="btn">Зачислить →</button>
              </ActionForm>
            )}
          </section>
          <section className="panel">
            <h2 className="panel-title">История общения</h2>
            <ActionForm action={addActivity} className="form-grid">
              <input type="hidden" name="id" value={id} />
              <label className="field wide">
                <span>Результат звонка или встречи</span>
                <textarea name="text" required rows={3} maxLength={3000} />
              </label>
              <button className="btn secondary">Добавить запись</button>
            </ActionForm>
            <div className="timeline" style={{ marginTop: 24 }}>
              {lead.activities.map((a) => (
                <div key={a.id}>
                  <p style={{ whiteSpace: "pre-wrap" }}>{a.text}</p>
                  <small>
                    {a.actorName} · {fmtDate(a.createdAt)}
                  </small>
                </div>
              ))}
            </div>
          </section>
          <ActionForm action={archiveLead}>
            <input type="hidden" name="id" value={id} />
            <input
              type="hidden"
              name="restore"
              value={lead.archivedAt ? "1" : "0"}
            />
            <button className="btn secondary">
              {lead.archivedAt ? "Восстановить лид" : "Перенести лид в архив"}
            </button>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
