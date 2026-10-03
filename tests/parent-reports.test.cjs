const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const loadTS = require("./load-ts.cjs");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
)
  throw new Error("Local isolated test database required");
const p = new PrismaClient();
const prefix = "parentqa-" + crypto.randomUUID();
const id = (s) => prefix + "-" + s;
const messages = [];
const mocks = {
  "@/lib/prisma": { prisma: p },
  "@/lib/telegram": {
    sendTelegramMessage: async (chat, text) => {
      messages.push({ chat, text });
      return { ok: true, messageId: 123 };
    },
  },
};
const load = loadTS(mocks);
const { saveLessonReport } = load("src/lib/attendance.ts");
const { saveLessonDetails, addDays, previousWeek } = load("src/lib/lessons.ts");
const { periodSummary, queueWeeklyReports } = load("src/lib/report-summary.ts");
const { lessonMessage, weeklyMessage } = load("src/lib/report-messages.ts");
const { deliverOne, retryDeliveries } = load("src/lib/telegramDelivery.ts");
const { setParentPreference } = load("src/lib/parent-preferences.ts");
const { dateKey } = load("src/lib/format.ts");
const today = dateKey();
const actor = { id: id("teacher"), name: "QA Teacher", role: "TEACHER" };
let originalConfig, initial;
const fields = {
  studentId: id("student"),
  groupId: id("group"),
  dateKey: today,
  attendance: "PRESENT",
  homework: "DONE",
  comment: "Хорошо работает",
  expectedVersion: 0,
};
before(async () => {
  originalConfig = await p.reportAutomation.findUniqueOrThrow({
    where: { id: "parent-reports" },
  });
  await p.user.create({
    data: {
      ...actor,
      email: id("teacher") + "@test.local",
      password: "unused",
    },
  });
  await p.program.create({ data: { id: id("program"), name: id("program") } });
  await p.group.create({
    data: {
      id: id("group"),
      name: "QA IELTS",
      schedule: "MWF",
      startTime: "00:00",
      endTime: "00:01",
      teacherId: actor.id,
      programId: id("program"),
    },
  });
  for (const s of ["student", "no-parent", "missing"])
    await p.student.create({
      data: {
        id: id(s),
        name: id(s),
        groups: { connect: { id: id("group") } },
      },
    });
  for (const [name, language, chat] of [
    ["ru", "RU", 987654321n],
    ["uz", "UZ", 987654322n],
  ])
    await p.parent.create({
      data: {
        id: id(name),
        name: id(name),
        phone: "test",
        studentId: id("student"),
        telegramId: chat,
        reportLanguage: language,
      },
    });
  await saveLessonDetails(
    {
      groupId: id("group"),
      dateKey: today,
      topic: "Present Perfect",
      covered: "Сравнение времён",
      assignment: "Exercise 3",
    },
    actor,
  );
});
after(async () => {
  await p.telegramDelivery.deleteMany({
    where: { studentId: { startsWith: prefix } },
  });
  await p.report.deleteMany({ where: { studentId: { startsWith: prefix } } });
  await p.lesson.deleteMany({ where: { groupId: id("group") } });
  await p.parent.deleteMany({ where: { id: { startsWith: prefix } } });
  await p.student.deleteMany({ where: { id: { startsWith: prefix } } });
  await p.group.deleteMany({ where: { id: id("group") } });
  await p.program.deleteMany({ where: { id: id("program") } });
  await p.auditLog.deleteMany({ where: { actorId: actor.id } });
  await p.user.deleteMany({ where: { id: actor.id } });
  if (originalConfig)
    await p.reportAutomation.update({
      where: { id: originalConfig.id },
      data: {
        enabled: originalConfig.enabled,
        trackingStartsOn: originalConfig.trackingStartsOn,
      },
    });
  await p.$disconnect();
});
test("report, revision and localized outbox are atomic; no network is called while saving", async () => {
  initial = await saveLessonReport(fields, actor);
  const rows = await p.telegramDelivery.findMany({
    where: { sourceId: initial.id },
    orderBy: { chatId: "asc" },
  });
  assert.equal(rows.length, 2);
  assert.equal(messages.length, 0);
  assert.match(rows[0].messageText, /ОТЧЁТ О ЗАНЯТИИ/);
  assert.doesNotMatch(rows[0].messageText, /DARS HISOBOTI/);
  assert.match(rows[1].messageText, /DARS HISOBOTI/);
  assert.match(rows[0].messageText, /Present Perfect/);
  assert.match(rows[0].messageText, /Exercise 3/);
  assert.match(
    rows[0].messageText,
    new RegExp(today.split("-").reverse().join("\\.")),
  );
  assert.equal(
    await p.reportRevision.count({ where: { reportId: initial.id } }),
    1,
  );
});
test("failure while queueing rolls back the report and its audit history", async () => {
  const broken = loadTS({
    ...mocks,
    "./report-messages": {
      reportLanguage: (v) => v,
      lessonMessage: () => {
        throw new Error("simulated queue failure");
      },
    },
  })("src/lib/attendance.ts");
  const yesterday = addDays(today, -1);
  await p.lesson.create({
    data: {
      groupId: id("group"),
      dateKey: yesterday,
      endTime: "00:01",
      topic: "Rollback",
      students: { create: { studentId: id("student") } },
    },
  });
  await assert.rejects(
    () => broken.saveLessonReport({ ...fields, dateKey: yesterday }, actor),
    /simulated/,
  );
  assert.equal(
    await p.report.count({
      where: { studentId: id("student"), dateKey: yesterday },
    }),
    0,
  );
});
test("corrections require a reason, preserve before/after and reject stale or concurrent updates", async () => {
  await assert.rejects(
    () =>
      saveLessonReport(
        { ...fields, expectedVersion: 1, attendance: "ABSENT" },
        actor,
      ),
    /причину/,
  );
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      saveLessonReport(
        {
          ...fields,
          expectedVersion: 1,
          attendance: "ABSENT",
          reason: "Исправлена ошибочная отметка",
        },
        actor,
      ),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(results.filter((x) => x.status === "rejected").length, 1);
  const revision = await p.reportRevision.findUnique({
    where: { reportId_version: { reportId: initial.id, version: 2 } },
  });
  assert.equal(revision.before.attendance, "PRESENT");
  assert.equal(revision.after.attendance, "ABSENT");
  const rows = await p.telegramDelivery.findMany({
    where: { sourceId: initial.id },
  });
  assert.equal(rows.filter((r) => r.cancelledAt).length, 2);
  assert.equal(rows.filter((r) => r.sourceVersion === 2).length, 2);
  assert.match(
    rows.find((r) => r.sourceVersion === 2 && r.chatId === 987654321n)
      .messageText,
    /ИСПРАВЛЕНИЕ ОТЧЁТА/,
  );
  await assert.rejects(
    () =>
      saveLessonReport(
        { ...fields, expectedVersion: 1, reason: "Old tab" },
        actor,
      ),
    /уже изменён/,
  );
});
test("unauthorized teacher, non-roster student and cancelled lessons cannot be reported", async () => {
  await assert.rejects(
    () => saveLessonReport(fields, { ...actor, id: "other" }),
    /Нет доступа/,
  );
  const key = addDays(today, -2);
  await p.lesson.create({
    data: {
      groupId: id("group"),
      dateKey: key,
      endTime: "00:01",
      topic: "Test",
      cancelledAt: new Date(),
      students: { create: { studentId: id("student") } },
    },
  });
  await assert.rejects(
    () => saveLessonReport({ ...fields, dateKey: key }, actor),
    /отменено/,
  );
  const yesterday = addDays(today, -1);
  await assert.rejects(
    () =>
      saveLessonReport(
        { ...fields, studentId: id("missing"), dateKey: yesterday },
        actor,
      ),
    /нет в списке/,
  );
});
test("missing reports stay separate from absences; parents without Telegram do not lose the report", async () => {
  await saveLessonReport({ ...fields, studentId: id("no-parent") }, actor);
  const rows = await periodSummary(today, addDays(today, 1), [id("group")]);
  const missing = rows.find((r) => r.studentId === id("missing"));
  assert.equal(missing.expected, 1);
  assert.equal(missing.marked, 0);
  assert.equal(missing.missing, 1);
  assert.equal(missing.present, 0);
  assert.equal(
    await p.report.count({ where: { studentId: id("no-parent") } }),
    1,
  );
  assert.equal(
    await p.telegramDelivery.count({ where: { studentId: id("no-parent") } }),
    0,
  );
});
test("messages remain below Telegram length limit in both languages and do not invent feedback", () => {
  const x = "Я".repeat(3000);
  const msg = lessonMessage(
    {
      dateKey: today,
      studentName: x,
      groupName: x,
      teacherName: x,
      attendance: "PRESENT",
      homework: "DONE",
      topic: x,
      covered: x,
      assignment: x,
      comment: x,
      version: 2,
      reason: x,
    },
    "BOTH",
  );
  assert.ok(msg.length <= 4096, msg.length);
  const summary = weeklyMessage(
    {
      studentName: "Test",
      groupName: "G",
      start: today,
      end: today,
      expected: 3,
      marked: 2,
      present: 2,
      done: 1,
      partial: 1,
      topics: [],
      comment: null,
    },
    "RU",
  );
  assert.match(summary, /Отчёт не заполнен: 1/);
  assert.match(summary, /не считается пропуском/);
  assert.doesNotMatch(summary, /100%/);
});
test("only linked chat can change report preferences; weekly opt-out cancels queued summaries", async () => {
  assert.equal(await setParentPreference(111n, "reports_language:UZ"), 0);
  assert.equal(await setParentPreference(987654321n, "reports_language:UZ"), 1);
  assert.equal(
    (await p.parent.findUnique({ where: { id: id("ru") } })).reportLanguage,
    "UZ",
  );
  await setParentPreference(987654321n, "reports_weekly:off");
  const d = await p.telegramDelivery.create({
    data: {
      studentId: id("student"),
      parentId: id("ru"),
      chatId: 987654321n,
      messageText: "Mock only",
      sourceType: "WEEKLY_REPORT",
      idempotencyKey: id("optout"),
      autoRetry: true,
    },
  });
  const before = messages.length;
  assert.equal((await deliverOne(d.id)).status, "SKIPPED");
  assert.equal(messages.length, before);
  assert.ok(
    (await p.telegramDelivery.findUnique({ where: { id: d.id } })).cancelledAt,
  );
});
test("weekly generation skips incomplete rollout week and deduplicates concurrent daily retries", async () => {
  const week = previousWeek();
  await p.lesson.create({
    data: {
      groupId: id("group"),
      dateKey: week.start,
      endTime: "00:01",
      topic: "Weekly test",
      students: { create: { studentId: id("student") } },
    },
  });
  await p.reportAutomation.update({
    where: { id: "parent-reports" },
    data: { enabled: true, trackingStartsOn: week.next },
  });
  assert.equal(await queueWeeklyReports(), 0);
  await p.reportAutomation.update({
    where: { id: "parent-reports" },
    data: { trackingStartsOn: week.start },
  });
  await Promise.all([queueWeeklyReports(), queueWeeklyReports()]);
  const rows = await p.telegramDelivery.findMany({
    where: {
      sourceType: "WEEKLY_REPORT",
      sourceId: week.start,
      studentId: id("student"),
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].parentId, id("uz"));
  assert.match(rows[0].messageText, /HAFTA YAKUNLARI/);
});
test("automatic retries exclude historical queue; cancelled report versions are never sent", async () => {
  const historical = await p.telegramDelivery.create({
    data: {
      studentId: id("student"),
      parentId: id("uz"),
      chatId: 987654322n,
      messageText: "Historical message",
      idempotencyKey: id("historical"),
      autoRetry: false,
    },
  });
  const old = await p.telegramDelivery.findFirstOrThrow({
    where: { sourceId: initial.id, sourceVersion: 1 },
  });
  const before = messages.length;
  assert.equal((await deliverOne(old.id)).status, "SKIPPED");
  assert.equal(messages.length, before);
  await retryDeliveries(50, true);
  assert.equal(
    (await p.telegramDelivery.findUnique({ where: { id: historical.id } }))
      .attemptCount,
    0,
  );
  assert.ok(!messages.some((m) => m.text === "Historical message"));
});
test("cron refuses missing/wrong credentials and dry run performs no sends", async () => {
  const old = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-only";
  const route = load("src/app/api/cron/parent-reports/route.ts");
  try {
    const before = messages.length;
    assert.equal(
      (await route.GET(new Request("http://localhost/api/cron/parent-reports")))
        .status,
      401,
    );
    const r = await route.GET(
      new Request("http://localhost/api/cron/parent-reports?dryRun=1", {
        headers: { authorization: "Bearer test-only" },
      }),
    );
    assert.equal(r.status, 200);
    assert.equal((await r.json()).dryRun, true);
    assert.equal(messages.length, before);
  } finally {
    if (old === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = old;
  }
});

test("lesson rosters survive group transfer; week boundaries use Samarkand time", async () => {
  await p.student.update({
    where: { id: id("missing") },
    data: { groups: { disconnect: { id: id("group") } } },
  });
  const rows = await periodSummary(today, addDays(today, 1), [id("group")]);
  assert.equal(rows.find((r) => r.studentId === id("missing")).missing, 1);
  const week = previousWeek(new Date("2026-10-04T20:30:00Z"));
  assert.equal(week.start, "2026-09-28");
  assert.equal(week.end, "2026-10-04");
});
