import Link from "next/link";
export default function Pagination({
  page,
  total,
  size = 30,
  base,
  params = {},
}: {
  page: number;
  total: number;
  size?: number;
  base: string;
  params?: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const url = (p: number) =>
    base + "?" + new URLSearchParams({ ...params, page: String(p) });
  return (
    <nav className="pagination" aria-label="Страницы">
      <span>
        {total} записей · Страница {page} из {pages}
      </span>
      <div>
        {page > 1 && (
          <Link className="btn secondary" href={url(page - 1)}>
            ← Назад
          </Link>
        )}
        {page < pages && (
          <Link className="btn secondary" href={url(page + 1)}>
            Далее →
          </Link>
        )}
      </div>
    </nav>
  );
}
