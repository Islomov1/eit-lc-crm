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
    key: "hw_explained",
    ru: "Разобрали домашнее задание, объяснили ошибки и правильные ответы.",
    uz: "Uy vazifasi tahlil qilindi, xatolar tushuntirildi va to‘g‘ri javoblar ko‘rsatildi.",
  },
  {
    key: "revision_done",
    ru: "Провели повторение пройденных тем и закрепили материал.",
    uz: "O‘tilgan mavzular takrorlandi va material mustahkamlandi.",
  },
  {
    key: "speaking_practice",
    ru: "Провели speaking practice: ответы на вопросы, исправление ошибок, развитие беглости.",
    uz: "Speaking practice qilindi: savollarga javob, xatolarni tuzatish, ravonlikni rivojlantirish.",
  },
  {
    key: "missed_topics",
    ru: "Закрыли пропущенные темы и объяснили ключевые моменты урока.",
    uz: "Qoldirilgan mavzular yopildi va darsning asosiy nuqtalari tushuntirildi.",
  },
  {
    key: "exam_support",
    ru: "Подготовка к тесту/экзамену: повторение, практика заданий, работа над ошибками.",
    uz: "Test/imtihonga tayyorgarlik: takrorlash, topshiriqlar amaliyoti, xatolar ustida ishlash.",
  },
  {
    key: "parent_contacted",
    ru: "Родителю передана обратная связь по прогрессу и рекомендациям.",
    uz: "Ota-onaga o‘quvchi progressi va tavsiyalar bo‘yicha fikr bildirildi.",
  },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getTodayDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function roundTo5Minutes(date = new Date()) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const rounded = Math.ceil(mins / 5) * 5;
  if (rounded === 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(rounded);
  }
  return d;
}

function getTimeInputValue(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addMinutesToTime(timeHHMM: string, minutesToAdd: number) {
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const base = new Date();
  base.setHours(hh || 0, mm || 0, 0, 0);
  base.setMinutes(base.getMinutes() + minutesToAdd);
  return getTimeInputValue(base);
}

export default function SupportSessionForm({
  students,
  action,
}: SupportSessionFormProps) {
  const nowRounded = roundTo5Minutes(new Date());

  const [query, setQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [date, setDate] = useState(getTodayDateInputValue(new Date()));
  const [startTime, setStartTime] = useState(getTimeInputValue(nowRounded));
  const [durationMin, setDurationMin] = useState<number>(30);
  const [comment, setComment] = useState("");
  const [sendToParents, setSendToParents] = useState(true);

  const endTime = useMemo(
    () => addMinutesToTime(startTime, durationMin),
    [startTime, durationMin]
  );

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students.slice(0, 20);

    return students
      .filter((s) => {
        const hay = `${s.name} ${s.groupName ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 30);
  }, [query, students]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId]
  );

  function applyTemplate(template: { ru: string; uz: string }) {
    const text = `RU: ${template.ru}\nUZ: ${template.uz}`;
    setComment((prev) => (prev.trim() ? `${prev}\n\n${text}` : text));
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow space-y-5">
      <div>
        <h2 className="font-semibold text-lg">Log Support Session</h2>
        <p className="text-sm text-slate-500 mt-1">
          Быстрая форма: поиск ученика, авто-дата, start + duration
        </p>
      </div>

      <form action={action} className="space-y-5">
        {/* Hidden fields expected by server action */}
        <input type="hidden" name="studentId" value={selectedStudentId} />
        <input
          type="hidden"
          name="start"
          value={`${date}T${startTime}`}
        />
        <input
          type="hidden"
          name="end"
          value={`${date}T${endTime}`}
        />
        <input
          type="hidden"
          name="comment"
          value={comment}
        />
        <input
          type="hidden"
          name="sendToParents"
          value={sendToParents ? "1" : "0"}
        />

        {/* Student search */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Поиск ученика / O‘quvchi qidirish
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Введите имя ученика или группу..."
              className="w-full border p-2.5 rounded-lg"
            />

            <div className="border rounded-xl bg-white max-h-60 overflow-auto">
              {filteredStudents.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">
                  Ничего не найдено
                </div>
              ) : (
                filteredStudents.map((student) => {
                  const active = student.id === selectedStudentId;
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setSelectedStudentId(student.id)}
                      className={`w-full text-left px-3 py-2 border-b last:border-b-0 transition ${
                        active
                          ? "bg-slate-900 text-white"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-medium">{student.name}</div>
                      <div
                        className={`text-xs ${
                          active ? "text-slate-200" : "text-slate-500"
                        }`}
                      >
                        {student.groupName ?? "Без группы"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">
              Выбранный ученик
            </label>

            <div className="border rounded-xl p-3 min-h-[96px] bg-slate-50">
              {selectedStudent ? (
                <>
                  <div className="font-semibold">{selectedStudent.name}</div>
                  <div className="text-sm text-slate-600 mt-1">
                    {selectedStudent.groupName ?? "Без группы"}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-500">
                  Сначала выберите ученика из списка
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm border rounded-xl p-3 bg-white">
              <input
                type="checkbox"
                checked={sendToParents}
                onChange={(e) => setSendToParents(e.target.checked)}
              />
              <span>
                Отправить отчёт родителям / Hisobotni ota-onaga yuborish
              </span>
            </label>
          </div>
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Дата / Sana
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border p-2.5 rounded-lg"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Начало / Boshlanishi
            </label>
            <input
              type="time"
              step={300}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border p-2.5 rounded-lg"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Длительность / Davomiyligi
            </label>
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="w-full border p-2.5 rounded-lg bg-white"
            >
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">
              Конец (auto) / Tugashi
            </label>
            <input
              type="time"
              value={endTime}
              readOnly
              className="w-full border p-2.5 rounded-lg bg-slate-100 text-slate-700"
            />
          </div>
        </div>

        {/* Quick templates */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Быстрые шаблоны (RU + UZ)
          </label>

          <div className="flex flex-wrap gap-2">
            {COMMENT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.key}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm"
                title={`${tpl.ru}\n${tpl.uz}`}
              >
                {tpl.key === "hw_explained" && "Домашка / Uy vazifasi"}
                {tpl.key === "revision_done" && "Повторение / Takrorlash"}
                {tpl.key === "speaking_practice" && "Speaking practice"}
                {tpl.key === "missed_topics" && "Пропущенные темы / Qoldirilgan mavzu"}
                {tpl.key === "exam_support" && "Подготовка / Tayyorgarlik"}
                {tpl.key === "parent_contacted" && "Связь с родителем / Ota-ona"}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setComment("")}
              className="px-3 py-2 rounded-lg border bg-white hover:bg-red-50 text-sm"
            >
              Очистить / Tozalash
            </button>
          </div>
        </div>

        {/* Comment editor */}
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1">
            Комментарий / Izoh (можно свой текст)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Введите комментарий вручную или используйте шаблоны выше..."
            rows={6}
            className="w-full border p-3 rounded-xl"
          />
          <p className="text-xs text-slate-500 mt-1">
            Шаблоны можно комбинировать. Свой текст тоже можно добавить.
          </p>
        </div>

        <button
          type="submit"
          disabled={!selectedStudentId}
          className="w-full bg-black text-white py-3 rounded-xl hover:opacity-85 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Session
        </button>
      </form>
    </div>
  );
}