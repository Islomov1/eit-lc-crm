"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="panel" role="alert">
      <h1>Не удалось загрузить страницу</h1>
      <p className="muted" style={{ margin: "18px 0" }}>
        Данные сохранены. Попробуйте повторить запрос.
      </p>
      <button className="btn" onClick={reset}>
        Повторить
      </button>
    </div>
  );
}
