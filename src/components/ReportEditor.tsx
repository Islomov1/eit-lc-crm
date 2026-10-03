import { ActionForm } from "./ActionForm";
import { saveReportAction } from "@/app/teacher/actions";
import { fmtDate } from "@/lib/format";
import type { Report, ReportRevision } from "@prisma/client";
export function ReportEditor({
  studentId,
  groupId,
  dateKey,
  report,
  disabled = false,
}: {
  studentId: string;
  groupId: string;
  dateKey: string;
  report?: (Report & { revisions?: ReportRevision[] }) | null;
  disabled?: boolean;
}) {
  return (
    <div>
      <ActionForm
        key={report?.version || 0}
        action={saveReportAction}
        className="form-grid"
      >
        <input type="hidden" name="studentId" value={studentId} />
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="dateKey" value={dateKey} />
        <input type="hidden" name="version" value={report?.version || 0} />
        <label className="field">
          <span>Посещаемость</span>
          <select
            name="attendance"
            required
            defaultValue={report?.attendance || ""}
          >
            <option value="" disabled>
              Выберите отметку
            </option>
            <option value="PRESENT">Присутствовал</option>
            <option value="ABSENT">Отсутствовал</option>
          </select>
        </label>
        <label className="field">
          <span>Домашнее задание</span>
          <select
            name="homework"
            required
            defaultValue={report?.homework || ""}
          >
            <option value="" disabled>
              Выберите отметку
            </option>
            <option value="DONE">Выполнено полностью</option>
            <option value="PARTIAL">Частично</option>
            <option value="NOT_DONE">Не выполнено</option>
          </select>
        </label>
        {report && (
          <>
            <label className="field wide">
              <span>Тема</span>
              <input
                name="topic"
                defaultValue={report.topic || ""}
                maxLength={180}
              />
            </label>
            <label className="field wide">
              <span>Изученный материал</span>
              <textarea
                name="covered"
                defaultValue={report.covered || ""}
                maxLength={500}
              />
            </label>
            <label className="field wide">
              <span>Задание к следующему занятию</span>
              <textarea
                name="assignment"
                defaultValue={report.assignment || ""}
                maxLength={600}
              />
            </label>
          </>
        )}
        <label className="field wide">
          <span>Комментарий для родителя</span>
          <textarea
            name="comment"
            defaultValue={report?.comment || ""}
            maxLength={1200}
            placeholder="Что получилось и над чем поработать"
            rows={2}
          />
        </label>
        {report && (
          <label className="field wide">
            <span>Причина исправления</span>
            <input
              name="reason"
              required
              maxLength={300}
              placeholder="Например: ученик пришёл позже, исправлена отметка"
            />
          </label>
        )}
        <button className="btn" disabled={disabled}>
          {report ? "Сохранить исправление" : "Сохранить и отправить"}
        </button>
      </ActionForm>
      {!!report?.revisions?.length && (
        <details className="report-history">
          <summary>История отчёта · {report.revisions.length}</summary>
          {report.revisions.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <strong>
                  Версия {r.version} · {r.reason}
                </strong>
                <small>
                  {fmtDate(r.createdAt)} · {r.actorName}
                </small>
                <p>{revisionText(r.after)}</p>
                {r.before && (
                  <small>До исправления: {revisionText(r.before)}</small>
                )}
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
function revisionText(value: unknown) {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== "object") return "—";
  const a = v.attendance === "PRESENT" ? "Присутствовал" : "Отсутствовал";
  const h =
    v.homework === "DONE"
      ? "ДЗ выполнено"
      : v.homework === "PARTIAL"
        ? "ДЗ частично"
        : "ДЗ не выполнено";
  return [a, h, v.topic, v.covered, v.assignment, v.comment]
    .filter(Boolean)
    .join(" · ");
}
