const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");
const { NextRequest } = require("next/server");

const source = fs.readFileSync(
  path.join(__dirname, "../src/app/api/leads/webhook/route.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function harness(secret = "test-only-secret") {
  const rows = new Map();
  const events = [];
  const errors = [];
  let writes = 0;
  const lead = {
    async create({ data }) {
      writes++;
      const id = data.id || `test-${writes}`;
      if (rows.has(id))
        throw Object.assign(new Error("Duplicate"), { code: "P2002" });
      const row = { ...data, id };
      rows.set(id, row);
      return row;
    },
    async findUnique({ where }) {
      return rows.get(where.id) || null;
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    process: { env: { WEBHOOK_SECRET: secret } },
    console: { error: (...args) => errors.push(args) },
    require(name) {
      if (name === "@/lib/prisma")
        return {
          prisma: {
            lead,
            leadForm: {
              findUnique: async ({ where }) =>
                where.id === "1410025207940063" ? { program: "SAT", learningFormat: "OFFLINE" } : null,
            },
          },
        };
      if (name === "next/server")
        return { ...require("next/server"), after: (callback) => callback() };
      if (name === "@/lib/meta-events")
        return { sendLeadEvent: (event) => events.push(event) };
      return require(name);
    },
  });
  return { ...exports, rows, events, errors, lead, writes: () => writes };
}

function request(
  payload,
  { token = "test-only-secret", raw, query = "", method = "POST" } = {},
) {
  return new NextRequest(`https://crm.example/api/leads/webhook${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(method === "POST" ? { body: raw ?? JSON.stringify(payload) } : {}),
  });
}

test("missing or incorrect authentication cannot write leads", async () => {
  for (const token of [null, "wrong"]) {
    const h = harness();
    assert.equal(
      (await h.POST(request({ name: "Test" }, { token }))).status,
      401,
    );
    assert.equal(h.writes(), 0);
  }
  const h = harness("");
  assert.equal((await h.POST(request({ name: "Test" }))).status, 503);
  assert.equal(h.writes(), 0);
});

test("bad JSON, empty names, objects and invalid Meta IDs are rejected without writes", async () => {
  const h = harness();
  for (const value of [
    null,
    [],
    {},
    { name: " " },
    { name: {} },
    { name: "Test", phone: {} },
    { name: "Test", metaLeadId: 12345 },
    { name: "Test", metaLeadId: "abc" },
    { name: "Test", dryRun: "true" },
  ]) {
    assert.equal((await h.POST(request(value))).status, 400);
  }
  assert.equal((await h.POST(request({}, { raw: "{" }))).status, 400);
  assert.equal(h.writes(), 0);
});

test("dry run checks auth and payload without writing or emitting conversion events", async () => {
  const h = harness();
  const response = await h.POST(
    request({ name: "Integration test", phone: "+998000000000", dryRun: true }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, dryRun: true });
  assert.equal(h.writes(), 0);
  assert.equal(h.events.length, 0);
});

test("concurrent retries create one Meta lead and one event, keeping later CRM status", async () => {
  const h = harness();
  const payload = {
    full_name: "  Example Student  ",
    phone_number: "+998000000000",
    source: "instagram",
    metaLeadId: "123456789012345",
  };
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => h.POST(request(payload))),
  );
  const bodies = await Promise.all(
    responses.map((response) => response.json()),
  );
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(h.rows.size, 1);
  assert.equal(h.events.length, 1);
  assert.equal(bodies.filter((body) => body.duplicate).length, 3);
  const row = [...h.rows.values()][0];
  assert.equal(row.name, "Example Student");
  assert.equal(row.phone, payload.phone_number);
  row.status = "CONVERTED";
  const retry = await (await h.POST(request(payload))).json();
  assert.equal(retry.lead.status, "CONVERTED");
  assert.equal(h.events.length, 1);
  await h.POST(request({ ...payload, metaLeadId: "123456789012346" }));
  assert.equal(h.rows.size, 2);
});

test("health check accepts header and legacy query token and rejects missing token", async () => {
  const h = harness();
  assert.equal((await h.GET(request(null, { method: "GET" }))).status, 200);
  assert.equal(
    (
      await h.GET(
        request(null, {
          method: "GET",
          token: null,
          query: "?secret=test-only-secret",
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await h.GET(request(null, { method: "GET", token: null }))).status,
    401,
  );
});

test("database failure is retryable, emits no event, and does not log private payload", async () => {
  const h = harness();
  h.lead.create = async () => {
    throw new Error("private data in database error");
  };
  const response = await h.POST(
    request({ name: "Private name", phone: "+998000000000" }),
  );
  assert.equal(response.status, 500);
  assert.equal(h.events.length, 0);
  assert.ok(!JSON.stringify(h.errors).includes("private data"));
  assert.ok(!JSON.stringify(h.errors).includes("Private name"));
});

test("known form IDs map to courses; explicit course is preserved", async () => {
  const h = harness();
  await h.POST(request({ name: "Test", note: "Form ID: 1410025207940063" }));
  await h.POST(
    request({ name: "Test", program: "IELTS", formId: "1410025207940063" }),
  );
  await h.POST(request({ name: "Test", formId: "999999999" }));
  assert.deepEqual(
    [...h.rows.values()].map((r) => r.program),
    ["SAT", "IELTS", null],
  );
  assert.deepEqual([...h.rows.values()].map(r => r.learningFormat), ["OFFLINE", "OFFLINE", "UNKNOWN"]);
  await h.POST(request({name: "Explicit online", formId: "1410025207940063", learningFormat: "ONLINE"}));
  assert.equal([...h.rows.values()].at(-1).learningFormat, "ONLINE");
  assert.equal((await h.POST(request({name: "Bad", learningFormat: "guess"}))).status, 400);
});
