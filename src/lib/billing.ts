export function monthWindow(anyDateInMonth: Date) {
  const start = new Date(anyDateInMonth.getFullYear(), anyDateInMonth.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(anyDateInMonth.getFullYear(), anyDateInMonth.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}