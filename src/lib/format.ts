export const money = (value: number) =>
  new Intl.NumberFormat("ru-RU").format(value) + " сум";
export const dateKey = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Samarkand",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
export const localDateTime = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Samarkand",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .format(d)
        .replace(" ", "T")
    : "";
export const fmtDate = (d: Date | string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Samarkand",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(d));
export function parseLocalDate(value: string) {
  if (!value) return null;
  const d = new Date(value + "+05:00");
  if (!Number.isFinite(d.getTime())) throw new Error("Некорректная дата");
  return d;
}
export function monthWindow(value: string) {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? value
    : dateKey().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  return {
    month,
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}
export const pageNumber = (value: unknown) =>
  Math.min(100000, Math.max(1, Math.floor(Number(value) || 1)));
export const textField = (f: FormData, name: string, max = 255) =>
  String(f.get(name) || "")
    .trim()
    .slice(0, max);
