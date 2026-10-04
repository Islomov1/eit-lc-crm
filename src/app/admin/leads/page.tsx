import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, LeadStatus, LearningFormat } from "@prisma/client";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import { ActionForm } from "@/components/ActionForm";
import { pageNumber, fmtDate } from "@/lib/format";
import { leadLabels, leadColors, learningFormatLabels } from "@/lib/lead-labels";
import { saveLead } from "./actions";
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole("ADMIN", "DIRECTOR");
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const q = (sp.q || "").trim();
  const status = Object.values(LeadStatus).includes(sp.status as LeadStatus)
    ? (sp.status as LeadStatus)
    : undefined;
  const archived = sp.archived === "1";
  const learningFormat = Object.values(LearningFormat).includes(sp.learningFormat as LearningFormat) ? sp.learningFormat as LearningFormat : undefined;
  const now = new Date();
  const where: Prisma.LeadWhereInput = {
    archivedAt: archived ? { not: null } : null,
    ...(learningFormat ? { learningFormat } : {}),
    ...(status ? { status } : {}),
    ...(sp.ownerId ? { ownerId: sp.ownerId } : {}),
    ...(sp.source ? { source: sp.source } : {}),
    ...(sp.due === "1"
      ? {
          followUpAt: { lte: now },
          status: { in: ["NEW", "ACTIVE", "FROZEN"] },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { program: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [leads, total, counts, owners] = await Promise.all([
    prisma.lead.findMany({
      where,
      take: 30,
      skip: (page - 1) * 30,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
    prisma.lead.count({ where }),
    prisma.lead.groupBy({
      by: ["status"],
      where: { archivedAt: null },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "DIRECTOR"] }, disabledAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const ownerMap = new Map(owners.map((x) => [x.id, x.name]));
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">ОТ ЗАЯВКИ ДО ПЕРВОГО ЗАНЯТИЯ</div>
          <h1>Лиды</h1>
          <p>Ответственные, контакты и следующие шаги.</p>
        </div>
        <Link
          className="btn secondary"
          href={archived ? "/admin/leads" : "/admin/leads?archived=1"}
        >
          {archived ? "Все активные" : "Архив лидов"}
        </Link>
      </header>
      <div className="metric-grid">
        {Object.entries(leadLabels).map(([key, label]) => (
          <Link
            key={key}
            href={"/admin/leads?status=" + key}
            className={"metric " + (status === key ? "accent" : "")}
          >
            <span className="metric-label">{label}</span>
            <strong>
              {counts.find((c) => c.status === key)?._count._all || 0}
            </strong>
            <small>Открыть список →</small>
          </Link>
        ))}
      </div>
      <form className="filters" key={JSON.stringify([q, status, sp.ownerId, sp.source, sp.due, learningFormat, archived])}>
        <select name="learningFormat" defaultValue={learningFormat || ""} aria-label="Формат обучения">
          <option value="">Все форматы</option>
          {Object.entries(learningFormatLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          name="q"
          defaultValue={q}
          aria-label="Поиск лидов"
          placeholder="Имя, телефон или курс"
        />
        <input type="hidden" name="archived" value={archived ? "1" : "0"} />
        <select name="status" defaultValue={status || ""} aria-label="Статус">
          <option value="">Все статусы</option>
          {Object.entries(leadLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          name="ownerId"
          defaultValue={sp.ownerId || ""}
          aria-label="Ответственный"
        >
          <option value="">Все ответственные</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          name="source"
          defaultValue={sp.source || ""}
          aria-label="Источник"
        >
          <option value="">Все источники</option>
          {[
            "instagram",
            "manual",
            "telegram",
            "website",
            "placement",
            "referral",
            "webhook",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          name="due"
          defaultValue={sp.due || ""}
          aria-label="Срок контакта"
        >
          <option value="">Все сроки</option>
          <option value="1">Пора связаться</option>
        </select>
        <button className="btn">Найти</button>
        <Link className="btn secondary" href="/admin/leads">
          Сбросить
        </Link>
      </form>
      {!archived && (
        <details className="panel" style={{ marginBottom: 24 }}>
          <summary className="details-summary">
            <h2>Добавить лид вручную</h2>
          </summary>
          <ActionForm action={saveLead} className="form-grid">
            <label className="field">
              <span>Имя</span>
              <input name="name" required maxLength={255} />
            </label>
            <label className="field">
              <span>Телефон</span>
              <input name="phone" type="tel" />
            </label>
            <label className="field">
              <span>Курс</span>
              <input name="program" placeholder="IELTS / SAT / CEFR / Kids" />
            </label>
            <label className="field">
              <span>Формат обучения</span>
              <select name="learningFormat" defaultValue="UNKNOWN">
                {Object.entries(learningFormatLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Ответственный</span>
              <select name="ownerId">
                <option value="">Не назначен</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field wide">
              <span>Заметка</span>
              <textarea name="note" rows={2} />
            </label>
            <button className="btn">Создать лид →</button>
          </ActionForm>
        </details>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Контакт</th>
              <th>Курс / источник</th>
              <th>Формат обучения</th>
              <th>Статус</th>
              <th>Ответственный</th>
              <th>Следующий контакт</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={"/admin/leads/" + l.id}>
                    <strong>{l.name}</strong>
                  </Link>
                  <p className="muted">{l.phone || "Нет телефона"}</p>
                  <small className="muted">Получен: {fmtDate(l.createdAt)}</small>
                </td>
                <td>
                  {l.program || "Не указан"}
                  <p className="muted">{l.source}</p>
                </td>
                <td><span className={"badge " + (l.learningFormat === "ONLINE" ? "blue" : l.learningFormat === "OFFLINE" ? "green" : "")}>{learningFormatLabels[l.learningFormat]}</span></td>
                <td>
                  <span className={"badge " + leadColors[l.status]}>
                    {leadLabels[l.status]}
                  </span>
                </td>
                <td>{ownerMap.get(l.ownerId || "") || "Не назначен"}</td>
                <td
                  className={
                    l.followUpAt && l.followUpAt < now ? "error-text" : "muted"
                  }
                >
                  {l.followUpAt ? fmtDate(l.followUpAt) : "Не запланирован"}
                </td>
                <td>
                  <Link className="btn secondary" href={"/admin/leads/" + l.id}>
                    Открыть →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!total && <div className="empty">Нет лидов по выбранным условиям</div>}
      </div>
      <Pagination
        page={page}
        total={total}
        base="/admin/leads"
        params={{
          q,
          status: status || "",
          ownerId: sp.ownerId || "",
          source: sp.source || "",
          due: sp.due || "",
          archived: archived ? "1" : "0",
          learningFormat: learningFormat || "",
        }}
      />
    </>
  );
}
