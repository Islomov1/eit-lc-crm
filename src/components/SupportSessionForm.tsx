"use client";

import { useMemo, useState } from "react";

type StudentOption = {
  id: string;
  name: string;
  groupName: string | null;
};

type SupportSessionFormProps = {
  students: StudentOption[];
  action: (formData: FormData) => Promise<void>;
};

const DURATION_OPTIONS = [15, 20, 30, 45, 60, 90, 120];

const COMMENT_TEMPLATES = [
  {
    key: "hw",
    label: "Домашка / Uy vazifasi",
    ru: "Разобрали домашнее задание: исправили ошибки, объяснили правильные ответы.",
    uz: "Uy vazifasi ko'rib chiqildi: xatolar tuzatildi, to'g'ri javoblar tushuntirildi.",
  },
  {
    key: "revision",
    label: "Повторение / Takrorlash",
    ru: "Повторили пройденный материал, закрепили грамматику и лексику.",
    uz: "O'tilgan mavzu takrorlandi, grammatika va leksika mustahkamlandi.",
  },
  {
    key: "speaking",
    label: "Speaking practice",
    ru: "Провели speaking practice: ответы на вопросы, исправление ошибок, развитие беглости.",
    uz: "Speaking practice qilindi: savollarga javob, xatolarni tuzatish, ravonlikni rivojlantirish.",
  },
  {
    key: "writing",
    label: "Writing practice",
    ru: "Работали над writing: структура эссе, аргументация, лексика и грамматика.",
    uz: "Writing ustida ishlandi: esse tuzilishi, argumentatsiya, leksika va grammatika.",
  },
  {
    key: "reading",
    label: "Reading / Reading",
    ru: "Разобрали reading задания: стратегии поиска ответов, работа со временем.",
    uz: "Reading topshiriqlari ko'rib chiqildi: javob qidirish strategiyalari, vaqt boshqaruvi.",
  },
  {
    key: "listening",
    label: "Listening / Listening",
    ru: "Провели listening практику: разбор заданий, работа с транскриптом.",
    uz: "Listening amaliyoti o'tkazildi: topshiriqlarni tahlil qilish, transkript bilan ishlash.",
  },
  {
    key: "missed",
    label: "Пропущенные темы / Qoldirilgan mavzu",
    ru: "Закрыли пропущенные темы, объяснили ключевые моменты урока.",
    uz: "Qoldirilgan mavzular yopildi, darsning asosiy nuqtalari tushuntirildi.",
  },
  {
    key: "exam",
    label: "Подготовка / Tayyorgarlik",
    ru: "Подготовка к экзамену: повторение, практика заданий, стратегия и управление временем.",
    uz: "Imtihonga tayyorgarlik: takrorlash, topshiriqlar amaliyoti, strategiya va vaqtni boshqarish.",
  },
  {
    key: "mock",
    label: "Mock exam / Mock imtihon",
    ru: "Провели пробный экзамен в условиях реального теста. Разобрали ошибки.",
    uz: "Haqiqiy test sharoitida sinov imtihoni o'tkazildi. Xatolar tahlil qilindi.",
  },
  {
    key: "vocab",
    label: "Vocabulary / Leksika",
    ru: "Работали над лексикой: новые слова, фразы, контекстное употребление.",
    uz: "Leksika ustida ishlandi: yangi so'zlar, iboralar, kontekstda qo'llash.",
  },
  {
    key: "grammar",
    label: "Grammar / Grammatika",
    ru: "Проработали грамматическую тему, выполнили упражнения на закрепление.",
    uz: "Grammatika mavzusi o'rganildi, mustahkamlash mashqlari bajarildi.",
  },
  {
    key: "sat_math",
    label: "SAT Math",
    ru: "Разобрали задачи по математике SAT: алгебра, геометрия, работа с данными.",
    uz: "SAT matematika masalalari ko'rib chiqildi: algebra, geometriya, ma'lumotlar bilan ishlash.",
  },
  {
    key: "sat_verbal",
    label: "SAT Verbal",
    ru: "Разобрали SAT Verbal: reading comprehension, grammar rules, работа с текстом.",
    uz: "SAT Verbal ko'rib chiqildi: reading comprehension, grammatika qoidalari, matn bilan ishlash.",
  },
  {
    key: "motivation",
    label: "Мотивация / Motivatsiya",
    ru: "Провели беседу о мотивации, поставили цели и обсудили план подготовки.",
    uz: "Motivatsiya haqida suhbat o'tkazildi, maqsadlar belgilandi va tayyorgarlik rejasi muhokama qilindi.",
  },
  {
    key: "parent",
    label: "Связь с родителем / Ota-ona",
    ru: "Родителю передана обратная связь по прогрессу ученика и рекомендации.",
    uz: "Ota-onaga o'quvchi progressi va tavsiyalar bo'yicha fikr bildirildi.",
  },
  {
    key: "individual",
    label: "Индивид. план / Individual reja",
    ru: "Составили индивидуальный план занятий с учётом слабых и сильных сторон.",
    uz: "Kuchli va zaif tomonlarni hisobga olgan holda individual mashg'ulot rejasi tuzildi.",
  },
];

/* ── helpers ─────────────────────────────────────────────── */

function pad(n: number) { return String(n).padStart(2, "0"); }

function getTodayDateValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function roundTo5(date = new Date()) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const m = Math.ceil(d.getMinutes() / 5) * 5;
  if (m === 60) { d.setHours(d.getHours() + 1); d.setMinutes(0); }
  else d.setMinutes(m);
  return d;
}

function getTimeValue(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addMinutes(timeHHMM: string, mins: number) {
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const d = new Date();
  d.setHours(hh || 0, (mm || 0) + mins, 0, 0);
  return getTimeValue(d);
}

/* ── component ───────────────────────────────────────────── */

export default function SupportSessionForm({ students, action }: SupportSessionFormProps) {
  const now = roundTo5();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [date, setDate] = useState(getTodayDateValue());
  const [startTime, setStartTime] = useState(getTimeValue(now));
  const [duration, setDuration] = useState(30);
  const [comment, setComment] = useState("");
  const [sendToParents, setSendToParents] = useState(true);

  const endTime = useMemo(() => addMinutes(startTime, duration), [startTime, duration]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students.slice(0, 20);
    return students.filter((s) =>
      `${s.name} ${s.groupName ?? ""}`.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [query, students]);

  const selected = students.find((s) => s.id === selectedId) ?? null;

  function applyTemplate(t: { ru: string; uz: string }) {
    const text = `RU: ${t.ru}\nUZ: ${t.uz}`;
    setComment((prev) => prev.trim() ? `${prev}\n\n${text}` : text);
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
      <div>
        <h2 className="font-semibold text-gray-900">Log Support Session</h2>
        <p className="text-xs text-gray-400 mt-1">Выберите ученика, время и добавьте комментарий</p>
      </div>

      <form action={action} className="space-y-6">
        {/* Hidden fields */}
        <input type="hidden" name="studentId" value={selectedId} />
        <input type="hidden" name="start" value={`${date}T${startTime}`} />
        <input type="hidden" name="end" value={`${date}T${endTime}`} />
        <input type="hidden" name="comment" value={comment} />
        <input type="hidden" name="sendToParents" value={sendToParents ? "1" : "0"} />

        {/* Student search + selected */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Поиск ученика / O&apos;quvchi qidirish
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя или группа..."
              className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-3 text-sm text-gray-400">Ничего не найдено</div>
              ) : (
                filtered.map((s) => {
                  const active = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left px-4 py-2.5 border-b border-gray-50 last:border-0 transition text-sm ${
                        active ? "bg-gray-900 text-white" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className={`ml-2 text-xs ${active ? "text-gray-300" : "text-gray-400"}`}>
                        {s.groupName ?? "Без группы"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Выбранный ученик
            </label>
            <div className="border border-gray-200 rounded-xl p-4 min-h-20 bg-gray-50">
              {selected ? (
                <>
                  <p className="font-semibold text-gray-900">{selected.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{selected.groupName ?? "Без группы"}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Сначала выберите ученика</p>
              )}
            </div>

            <label className="flex items-center gap-3 cursor-pointer border border-gray-200 rounded-xl p-3 hover:bg-gray-50 transition">
              <input
                type="checkbox"
                checked={sendToParents}
                onChange={(e) => setSendToParents(e.target.checked)}
                className="w-4 h-4 accent-gray-900"
              />
              <span className="text-sm text-gray-700">
                Отправить отчёт родителям
              </span>
            </label>
          </div>
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Дата / Sana</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Начало / Boshlanishi</label>
            <input
              type="time"
              step={300}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Длительность</label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} мин</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Конец (авто)</label>
            <input
              type="time"
              value={endTime}
              readOnly
              className="w-full h-11 border border-gray-200 rounded-xl px-3 text-sm bg-gray-50 text-gray-600"
            />
          </div>
        </div>

        {/* Templates */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Быстрые шаблоны (RU + UZ)
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMENT_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => applyTemplate(t)}
                title={`RU: ${t.ru}\nUZ: ${t.uz}`}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 hover:bg-gray-900 hover:text-white hover:border-gray-900 transition"
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setComment("")}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-red-500 hover:bg-red-50 hover:border-red-200 transition"
            >
              Очистить / Tozalash
            </button>
          </div>
        </div>

        {/* Comment textarea */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Комментарий / Izoh (можно свой текст)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Введите комментарий вручную или используйте шаблоны выше..."
            rows={6}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y"
          />
          <p className="text-xs text-gray-400">Шаблоны можно комбинировать. Свой текст тоже можно добавить.</p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!selectedId}
          className="w-full h-12 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save Session
        </button>
      </form>
    </div>
  );
}