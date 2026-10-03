"use client";
import { useState } from "react";
export default function WarningForm({ month }: { month: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMessage("");
        try {
          const r = await fetch(
            "/api/admin/send-attendance-warning?month=" + month,
            { method: "POST" },
          );
          if (!r.ok) throw new Error("Не удалось отправить предупреждения");
          setMessage("Обработка завершена. Проверьте журнал доставки.");
        } catch (e) {
          setMessage(e instanceof Error ? e.message : "Ошибка соединения");
        } finally {
          setPending(false);
        }
      }}
    >
      <p className="muted wide">
        Предупреждение получат родители учеников с посещаемостью ниже 70% по
        отмеченным занятиям месяца. Повторные отправки за тот же месяц не
        дублируются.
      </p>
      <label className="wide">
        <input type="checkbox" required /> Подтверждаю отправку родителям
      </label>
      <button className="btn" disabled={pending}>
        {pending ? "Отправляем…" : "Отправить предупреждения"}
      </button>
      <p className="wide" role="status">
        {message}
      </p>
    </form>
  );
}
