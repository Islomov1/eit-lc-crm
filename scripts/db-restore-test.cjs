const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const url = new URL(process.env.RESTORE_TEST_URL || "http://invalid");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
)
  throw new Error("Restore is restricted to a local database named *_test.");
if (!process.argv[2])
  throw new Error(
    "Provide a custom pg_dump archive. The target database must exist and be empty.",
  );
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
};
const bin = process.env.PG_BIN
  ? join(process.env.PG_BIN, "pg_restore")
  : "pg_restore";
const result = spawnSync(
  bin,
  [
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    "--dbname",
    env.PGDATABASE,
    process.argv[2],
  ],
  { env, encoding: "utf8" },
);
if (result.status !== 0)
  throw new Error(
    "Restore failed. Use an empty local *_test database and a compatible PostgreSQL client.",
  );
console.log("Restore completed in isolated local test database.");
