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
  throw new Error("Tests require an isolated local *_test database");
const p = new PrismaClient();
const telegramTestUpdates = [];
const prefix = "qa-" + crypto.randomUUID();
const id = (n) => prefix + "-" + n;
const actor = { id: id("admin"), name: "QA Director" };
let jar = new Map();
let sends = 0;
const load = loadTS({
  "@/lib/prisma": { prisma: p },
  react: { cache: (fn) => fn },
  "next/headers": {
    cookies: async () => ({
      get: (k) => (jar.has(k) ? { value: jar.get(k) } : undefined),
      set: (k, v) => jar.set(k, v),
      delete: (k) => jar.delete(k),
    }),
  },
  "next/navigation": {
    redirect: (path) => {
      throw new Error("REDIRECT:" + path);
    },
  },
  "@/lib/telegram": {
    sendTelegramMessage: async () => {
      sends++;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, messageId: 1 };
    },
  },
});
const { recordAttendance } = load("src/lib/attendance.ts"),
  { savePaymentRecord, ledger, paymentTotals } = load("src/lib/payments.ts"),
  { convertLeadRecord } = load("src/lib/lead-workflow.ts"),
  { createSession, getCurrentUser, requireRole, hashToken } =
    load("src/lib/auth.ts"),
  { deliverOne } = load("src/lib/telegramDelivery.ts");
before(async () => {
  await p.user.createMany({
    data: [
      {
        id: id("admin"),
        name: "QA Director",
        email: id("admin") + "@test.local",
        password: "unused",
        role: "DIRECTOR",
      },
      {
        id: id("teacher"),
        name: "QA Teacher",
        email: id("teacher") + "@test.local",
        password: "unused",
        role: "TEACHER",
      },
      {
        id: id("other"),
        name: "QA Other",
        email: id("other") + "@test.local",
        password: "unused",
        role: "TEACHER",
      },
    ],
  });
  await p.program.create({ data: { id: id("program"), name: id("program") } });
  for (const n of ["g1", "g2"])
    await p.group.create({
      data: {
        id: id(n),
        name: id(n),
        teacherId: id("teacher"),
        programId: id("program"),
        schedule: "MWF",
        startTime: "12:00",
        endTime: "13:00",
        createdAt: new Date("2026-01-01"),
        monthlyFee: 750000,
      },
    });
  await p.student.create({
    data: {
      id: id("student"),
      name: id("student"),
      createdAt: new Date("2026-01-01"),
      groups: { connect: [{ id: id("g1") }, { id: id("g2") }] },
    },
  });
});
after(async () => {
  const lead = await p.lead.findUnique({ where: { id: id("lead") } });
  const ids = [id("student"), ...(lead?.studentId ? [lead.studentId] : [])];
  await p.telegramUpdate.deleteMany({
    where: { updateId: { in: telegramTestUpdates } },
  });
  await p.analyticsEvent.deleteMany({ where: { studentId: { in: ids } } });
  await p.telegramPendingLink.deleteMany({ where: { studentId: { in: ids } } });
  await p.telegramDelivery.deleteMany({ where: { studentId: { in: ids } } });
  await p.parent.deleteMany({ where: { studentId: { in: ids } } });
  await p.leadActivity.deleteMany({
    where: { leadId: { startsWith: prefix } },
  });
  await p.lead.deleteMany({ where: { id: { startsWith: prefix } } });
  await p.report.deleteMany({ where: { studentId: { in: ids } } });
  await p.payment.deleteMany({ where: { studentId: { in: ids } } });
  await p.auditLog.deleteMany({
    where: {
      OR: [{ actorId: { startsWith: prefix } }, { entityId: { in: ids } }],
    },
  });
  await p.student.deleteMany({ where: { id: { in: ids } } });
  await p.group.deleteMany({ where: { id: { startsWith: prefix } } });
  await p.program.deleteMany({ where: { id: { startsWith: prefix } } });
  await p.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await p.$disconnect();
});
test("forged cookies fail; sessions expire, revoke and obey database role", async () => {
  jar = new Map([
    ["userId", actor.id],
    ["userRole", "DIRECTOR"],
  ]);
  assert.equal(await getCurrentUser(), null);
  await createSession(id("teacher"));
  const token = jar.get("eit_session");
  assert.equal((await getCurrentUser()).role, "TEACHER");
  await assert.rejects(() => requireRole("DIRECTOR"), /REDIRECT:\/teacher/);
  await p.session.update({
    where: { tokenHash: hashToken(token) },
    data: { expiresAt: new Date(0) },
  });
  assert.equal(await getCurrentUser(), null);
  await createSession(actor.id);
  await p.user.update({
    where: { id: actor.id },
    data: { disabledAt: new Date() },
  });
  assert.equal(await getCurrentUser(), null);
  await p.user.update({ where: { id: actor.id }, data: { disabledAt: null } });
  await p.session.deleteMany({ where: { userId: actor.id } });
  assert.equal(await getCurrentUser(), null);
});
test("same student can be marked in two groups on one day; another teacher cannot write", async () => {
  const base = {
    studentId: id("student"),
    teacherId: id("teacher"),
    attendance: "PRESENT",
    homework: "DONE",
    comment: null,
    dateKey: "2026-10-04",
  };
  for (const group of ["g1", "g2"])
    await recordAttendance({ ...base, groupId: id(group) });
  await Promise.all([
    recordAttendance({ ...base, groupId: id("g1") }),
    recordAttendance({ ...base, groupId: id("g1") }),
  ]);
  assert.equal(
    await p.report.count({ where: { studentId: id("student") } }),
    2,
  );
  await assert.rejects(
    () =>
      recordAttendance({ ...base, teacherId: id("other"), groupId: id("g1") }),
    /Нет доступа/,
  );
});
test("two course payments remain independent; partial balance and edit conflicts are correct", async () => {
  const base = {
    studentId: id("student"),
    month: "2026-10",
    baseAmount: 750000,
    discountPct: 0,
    bonus: 0,
    received: 300000,
    method: "CASH",
    status: "PARTIAL",
    note: "Test",
    version: "",
  };
  const first = await savePaymentRecord({ ...base, groupId: id("g1") }, actor);
  await savePaymentRecord(
    { ...base, groupId: id("g2"), received: 750000 },
    actor,
  );
  const result = await ledger({
    month: "2026-10",
    q: id("student"),
    all: true,
  });
  assert.equal(result.rows.length, 2);
  const debt = await load("src/lib/dashboard.ts").debtSummary("2026-10");
  assert.equal(
    debt.rows.find((r) => r.studentId === id("student")).balance,
    450000,
  );
  assert.equal(
    result.rows.reduce((s, r) => s + r.balance, 0),
    450000,
  );
  assert.equal(
    result.rows.reduce((s, r) => s + r.paidAmount, 0),
    1050000,
  );
  await assert.rejects(
    () =>
      savePaymentRecord(
        {
          ...base,
          groupId: id("g1"),
          received: 750000,
          version: "old-version",
        },
        actor,
      ),
    /уже изменена/,
  );
  await savePaymentRecord(
    {
      ...base,
      groupId: id("g1"),
      received: 750000,
      version: first.updatedAt.toISOString(),
    },
    actor,
  );
  assert.equal(
    (await p.payment.findUnique({ where: { id: first.id } })).status,
    "PAID",
  );
  assert.throws(() => paymentTotals(750000, 0, 0, 800000), /превышает/);
});
test("parallel lead conversion creates only one linked student and keeps notes", async () => {
  await p.lead.create({
    data: {
      id: id("lead"),
      name: id("converted"),
      phone: "+998000000000",
      note: "Original note",
    },
  });
  const ids = await Promise.all(
    Array.from({ length: 4 }, () =>
      convertLeadRecord(id("lead"), id("g1"), actor),
    ),
  );
  assert.equal(new Set(ids).size, 1);
  assert.equal(await p.student.count({ where: { name: id("converted") } }), 1);
  const lead = await p.lead.findUnique({
    where: { id: id("lead") },
    include: { student: true },
  });
  assert.equal(lead.status, "CONVERTED");
  assert.equal(lead.student.note, "Original note");
});
test("archiving preserves attendance, payments and contact history", async () => {
  await p.student.update({
    where: { id: id("student") },
    data: { archivedAt: new Date() },
  });
  assert.equal(
    await p.report.count({ where: { studentId: id("student") } }),
    2,
  );
  assert.equal(
    await p.payment.count({ where: { studentId: id("student") } }),
    2,
  );
  assert.equal(
    (await ledger({ month: "2026-10", q: id("student"), all: true })).rows
      .length,
    2,
  );
  await p.student.update({
    where: { id: id("student") },
    data: { archivedAt: null },
  });
});
test("concurrent notification retries claim once and disconnected parents are not sent messages", async () => {
  await p.parent.create({
    data: {
      id: id("parent"),
      studentId: id("student"),
      name: "QA Parent",
      phone: "test",
      telegramId: 123456789n,
    },
  });
  await p.telegramDelivery.create({
    data: {
      id: id("delivery"),
      studentId: id("student"),
      parentId: id("parent"),
      chatId: 123456789n,
      messageText: "Mock only",
      idempotencyKey: id("notification"),
    },
  });
  await Promise.all(
    Array.from({ length: 5 }, () => deliverOne(id("delivery"))),
  );
  assert.equal(sends, 1);
  assert.equal(
    (await p.telegramDelivery.findUnique({ where: { id: id("delivery") } }))
      .status,
    "SENT",
  );
  await p.parent.update({
    where: { id: id("parent") },
    data: { telegramId: null },
  });
  await p.telegramDelivery.create({
    data: {
      id: id("delivery2"),
      studentId: id("student"),
      parentId: id("parent"),
      chatId: 123456789n,
      messageText: "Mock only",
      idempotencyKey: id("notification2"),
    },
  });
  assert.equal((await deliverOne(id("delivery2"))).status, "FAILED");
  assert.equal(sends, 1);
});

test("same-origin login works behind Next hostname normalization, cross-origin requests fail", () => {
  const { sameOrigin } = load("src/lib/auth.ts");
  assert.equal(
    sameOrigin(
      new Request("http://localhost:4180/api/login", {
        headers: { host: "127.0.0.1:4180", origin: "http://127.0.0.1:4180" },
      }),
    ),
    true,
  );
  assert.equal(
    sameOrigin(
      new Request("https://eit-lc-crm.vercel.app/api/login", {
        headers: {
          host: "eit-lc-crm.vercel.app",
          origin: "https://example.com",
        },
      }),
    ),
    false,
  );
});

test("Telegram linking rejects another chat and expired confirmation, accepts the verified chat", async () => {
  const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  process.env.TELEGRAM_WEBHOOK_SECRET = "local-test-only";
  const tg = loadTS({
    "@/lib/prisma": { prisma: p },
    "@/lib/telegram": {
      answerTelegramCallbackQuery: async () => {},
      removeTelegramReplyKeyboard: async () => {},
      sendTelegramContactRequestKeyboard: async () => {},
      sendTelegramMessage: async () => ({ ok: true }),
      sendTelegramMessageWithInlineKeyboard: async () => {},
    },
  })("src/app/api/telegram/route.ts");
  const chat = 123456789;
  const sid = id("pending");
  await p.telegramPendingLink.create({
    data: {
      sessionId: sid,
      chatId: BigInt(chat),
      parentId: id("parent"),
      studentId: id("student"),
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  async function confirm(chatId) {
    const updateId = crypto.randomInt(1000000000, 2000000000);
    telegramTestUpdates.push(updateId);
    return tg.POST(
      new Request("http://localhost/api/telegram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bot-api-secret-token": "local-test-only",
        },
        body: JSON.stringify({
          update_id: updateId,
          callback_query: {
            id: "qa",
            from: { id: chatId },
            data: "link_yes:session:" + sid,
            message: { chat: { id: chatId, type: "private" } },
          },
        }),
      }),
    );
  }
  try {
    await confirm(chat + 1);
    assert.equal(
      (await p.parent.findUnique({ where: { id: id("parent") } })).telegramId,
      null,
    );
    await p.telegramPendingLink.updateMany({
      where: { sessionId: sid },
      data: { expiresAt: new Date(0) },
    });
    await confirm(chat);
    assert.equal(
      (await p.parent.findUnique({ where: { id: id("parent") } })).telegramId,
      null,
    );
    await p.telegramPendingLink.updateMany({
      where: { sessionId: sid },
      data: { expiresAt: new Date(Date.now() + 60000) },
    });
    await confirm(chat);
    assert.equal(
      (await p.parent.findUnique({ where: { id: id("parent") } })).telegramId,
      BigInt(chat),
    );
  } finally {
    if (previousSecret === undefined)
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
  }
});

test("login rate-limit expiration is fifteen minutes regardless of database timezone", async () => {
  const route = load("src/app/api/login/route.ts");
  const email = id("unknown") + "@test.local";
  try {
    const r = await route.POST(
      new Request("http://localhost/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          host: "localhost",
          origin: "http://localhost",
        },
        body: JSON.stringify({ email, password: "invalid-password" }),
      }),
    );
    assert.equal(r.status, 401);
    const attempt = await p.loginAttempt.findUniqueOrThrow({
      where: { key: hashToken(email) },
    });
    const remaining = attempt.expiresAt.getTime() - Date.now();
    assert.ok(
      remaining > 880000 && remaining <= 900000,
      "expiration must be fifteen minutes",
    );
  } finally {
    await p.loginAttempt.deleteMany({ where: { key: hashToken(email) } });
  }
});
