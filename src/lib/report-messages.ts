export type ReportLanguage = "RU" | "UZ" | "BOTH";
export const reportLanguage = (value: unknown): ReportLanguage =>
  value === "RU" || value === "UZ" ? value : "BOTH";
export const lessonDate = (key: string) => key.split("-").reverse().join(".");
const short = (s: string | null | undefined, length = 500) =>
  s ? s.slice(0, length) : "—";
export type ReportMessage = {
  dateKey: string;
  studentName: string;
  groupName: string;
  teacherName: string;
  attendance: string;
  homework: string;
  comment?: string | null;
  topic?: string | null;
  covered?: string | null;
  assignment?: string | null;
  version: number;
  reason?: string;
};
export function lessonMessage(r: ReportMessage, language: ReportLanguage) {
  const ru = `📚 EIT · ${r.version > 1 ? "ИСПРАВЛЕНИЕ ОТЧЁТА" : "ОТЧЁТ О ЗАНЯТИИ"}
${lessonDate(r.dateKey)} · ${short(r.groupName, 100)}
Ученик: ${short(r.studentName, 100)}
Тема: ${short(r.topic, 180)}
Изучили: ${short(r.covered, 250)}
Посещаемость: ${r.attendance === "PRESENT" ? "присутствовал" : "отсутствовал"}
Домашнее задание: ${{ DONE: "выполнено полностью", PARTIAL: "выполнено частично", NOT_DONE: "не выполнено" }[r.homework] || "не оценено"}
К следующему занятию: ${short(r.assignment, 300)}
Комментарий: ${short(r.comment, 350)}
Преподаватель: ${short(r.teacherName, 100)}${r.version > 1 ? `\nВерсия ${r.version}. Причина исправления: ${short(r.reason, 200)}` : ""}`;
  const uz = `📚 EIT · ${r.version > 1 ? "TUZATILGAN HISOBOT" : "DARS HISOBOTI"}
${lessonDate(r.dateKey)} · ${short(r.groupName, 100)}
O‘quvchi: ${short(r.studentName, 100)}
Mavzu: ${short(r.topic, 180)}
O‘rganildi: ${short(r.covered, 250)}
Davomat: ${r.attendance === "PRESENT" ? "qatnashdi" : "qatnashmadi"}
Uy vazifasi: ${{ DONE: "to‘liq bajarilgan", PARTIAL: "qisman bajarilgan", NOT_DONE: "bajarilmagan" }[r.homework] || "baholanmagan"}
Keyingi darsga: ${short(r.assignment, 300)}
Izoh: ${short(r.comment, 350)}
O‘qituvchi: ${short(r.teacherName, 100)}${r.version > 1 ? `\n${r.version}-versiya. Tuzatish sababi: ${short(r.reason, 200)}` : ""}`;
  return language === "RU"
    ? ru
    : language === "UZ"
      ? uz
      : ru + "\n\n————————\n\n" + uz;
}
export type WeeklyMessage = {
  studentName: string;
  groupName: string;
  start: string;
  end: string;
  expected: number;
  marked: number;
  present: number;
  done: number;
  partial: number;
  topics: string[];
  untracked?: number;
  comment?: string | null;
};
export function weeklyMessage(s: WeeklyMessage, language: ReportLanguage) {
  const missing = Math.max(0, s.expected - s.marked);
  const ru = `📊 EIT · ИТОГИ НЕДЕЛИ
${lessonDate(s.start)}–${lessonDate(s.end)}
${short(s.studentName, 100)} · ${short(s.groupName, 100)}
Занятий по списку: ${s.expected}${s.untracked ? `\nБез списка занятия: ${s.untracked}. Эти занятия не включены в сводку.` : ""}
Присутствовал: ${s.present} · Отсутствовал: ${s.marked - s.present}
Отчёт не заполнен: ${missing}${missing ? " (не считается пропуском)" : ""}
ДЗ выполнено полностью: ${s.done} из ${s.marked} отметок
Частично: ${s.partial} · Не выполнено: ${s.marked - s.done - s.partial}
Темы: ${short(s.topics.join("; "), 400)}
Последний комментарий преподавателя: ${short(s.comment, 500)}
Вопросы по результатам можно обсудить с администратором EIT.`;
  const uz = `📊 EIT · HAFTA YAKUNLARI
${lessonDate(s.start)}–${lessonDate(s.end)}
${short(s.studentName, 100)} · ${short(s.groupName, 100)}
Ro‘yxat bo‘yicha darslar: ${s.expected}${s.untracked ? `\nDars ro‘yxati mavjud emas: ${s.untracked}. Bu darslar xulosaga kiritilmagan.` : ""}
Qatnashdi: ${s.present} · Qatnashmadi: ${s.marked - s.present}
Hisobot to‘ldirilmagan: ${missing}${missing ? " (dars qoldirish hisoblanmaydi)" : ""}
Uy vazifasi to‘liq bajarildi: ${s.done} / ${s.marked}
Qisman: ${s.partial} · Bajarilmagan: ${s.marked - s.done - s.partial}
Mavzular: ${short(s.topics.join("; "), 400)}
O‘qituvchining so‘nggi izohi: ${short(s.comment, 500)}
Natijalar bo‘yicha savollarni EIT administratori bilan muhokama qilishingiz mumkin.`;
  return language === "RU"
    ? ru
    : language === "UZ"
      ? uz
      : ru + "\n\n————————\n\n" + uz;
}
