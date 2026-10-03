const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
)
  throw new Error("Isolated local test DB required");
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:4180";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Local server required");
const p = new PrismaClient();
const sessionIds = [];
async function session(role) {
  const u = await p.user.findFirstOrThrow({
    where: { role, disabledAt: null },
  });
  const token = crypto.randomBytes(32).toString("hex");
  const s = await p.session.create({
    data: {
      userId: u.id,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 120000),
    },
  });
  sessionIds.push(s.id);
  return `eit_session=${token}`;
}
async function request(path, cookie, expected = 200) {
  const t = performance.now();
  const r = await fetch(origin + path, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const html = await r.text();
  if (expected === 307 && r.status === 200) {
    assert.ok(
      html.includes("NEXT_REDIRECT;replace;/admin;307;"),
      path + " missing streamed redirect",
    );
    assert.ok(!html.includes('name="password"'), path + " leaked staff editor");
  } else assert.equal(r.status, expected, path);
  assert.ok(
    !html.includes('"digest":"') &&
      !html.includes("Application error: a server-side exception"),
    path + " server error",
  );
  console.log(
    `${expected} ${path.split("?")[0]} ${Math.round(performance.now() - t)}ms`,
  );
  return r;
}
(async () => {
  try {
    const director = await session("DIRECTOR");
    for (const route of [
      "/admin",
      "/admin/leads",
      "/admin/parent-reports",
      "/admin/students",
      "/admin/groups",
      "/admin/timetable",
      "/admin/attendance",
      "/admin/payments",
      "/admin/support",
      "/admin/analytics",
      "/admin/expenses",
      "/admin/users",
      "/admin/telegram-status",
      "/admin/audit",
      "/admin/payments/export",
      "/admin/payments/print",
      "/admin/support-export",
    ])
      await request(route, director);
    const student = await p.student.findFirstOrThrow();
    await request("/admin/students/" + student.id, director);
    const teacher = await session("TEACHER");
    for (const route of ["/teacher", "/teacher/students", "/teacher/reports"])
      await request(route, teacher);
    await request("/support", await session("SUPPORT"));
    for (const cookie of [
      undefined,
      "userId=forged; userRole=DIRECTOR",
      "eit_session=" + "f".repeat(64),
    ])
      await request("/admin", cookie, 307);
    const admin = await session("ADMIN");
    for (const route of [
      "/admin/users",
      "/admin/analytics",
      "/admin/expenses",
      "/admin/audit",
    ])
      await request(route, admin, 307);
    await request("/api/students", teacher, 403);
    console.log("HTTP smoke passed");
  } finally {
    await p.session.deleteMany({ where: { id: { in: sessionIds } } });
    await p.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
