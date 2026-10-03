// pg_dump credentials stay in the child environment, never in process arguments.
const { loadEnvConfig } = require("@next/env");
const { spawnSync } = require("node:child_process");
const { chmodSync, statSync } = require("node:fs");
const { resolve, join } = require("node:path");
loadEnvConfig(process.cwd());
const output = process.argv[2];
if (!output)
  throw new Error(
    "Usage: node scripts/db-backup.cjs /private/path/backup.dump",
  );
const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
  PGSSLMODE: ["localhost", "127.0.0.1"].includes(url.hostname)
    ? "prefer"
    : "require",
};
const bin = process.env.PG_BIN
  ? join(process.env.PG_BIN, "pg_dump")
  : "pg_dump";
const result = spawnSync(
  bin,
  ["--format=custom", "--no-owner", "--no-acl", "--file", resolve(output)],
  { env, encoding: "utf8" },
);
if (result.status !== 0)
  throw new Error(
    "Backup failed. Check PostgreSQL client version, connection and output permissions.",
  );
chmodSync(output, 0o600);
console.log(
  JSON.stringify({ file: resolve(output), bytes: statSync(output).size }),
);
