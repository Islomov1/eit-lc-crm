# Deployment and recovery

1. Create a fresh private backup before applying migrations. With PostgreSQL 15 clients:
   `PG_BIN=/opt/homebrew/opt/postgresql@15/bin node scripts/db-backup.cjs /private/location/pre-release.dump`
2. Restore into a **new empty local** database ending in `_test`, using `RESTORE_TEST_URL` and `scripts/db-restore-test.cjs`. Compare table counts and checksums before and after migrations. Do not overwrite production during a restore drill.
3. Run tests, lint and build. Disable outbound integration credentials locally.
4. Build the Vercel production target with `vercel deploy --prod --skip-domain`; keep the current alias serving until the new build is ready.
5. Apply `prisma migrate deploy` using the production direct database connection, then promptly `vercel promote <deployment-url>`. This release changes payment/report unique indexes; old code must not continue writing after the migration.
6. Verify login, authenticated pages, role restrictions, exports and webhook dry runs. Push the reviewed commit; verify the Git deployment is Ready and matches the intended commit.

## Release 2026-10-04

Migration `20261004090000_crm_upgrade` adds sessions, archives, audit, lead workflow, group fees and received payment totals. Existing PAID payments are backfilled to their full amount. Legacy PARTIAL rows require manual reconciliation because the old database never recorded how much had been received; these are labelled in their notes. The verified pre-release backup contained no PARTIAL rows.

Migration `20261004100000_director_and_fees` assigns DIRECTOR to the specifically approved EIT Admin record and infers each group's fee from its most recent nonzero invoice base amount. The default for groups without recorded fees is 750,000 UZS.

All staff must log in again. Passwords are unchanged. Student, parent, report, payment and Telegram history are retained.

## Rollback

Prefer a forward fix using the migrated schema. Do not simply promote pre-upgrade code: it expects the old payment/report uniqueness constraints. A full database rollback requires pausing writes, retaining a fresh copy of all post-release data, restoring the verified backup into a separate database, validating it, and coordinating the database endpoint with the matching old deployment. Restoring a pre-release backup directly over live data can lose subsequent work.

## Runtime region

Vercel functions run in Frankfurt (`fra1`), beside the database in `eu-central-1`. The build service may still report a US build location; the `regions` configuration controls runtime placement.

## Integrations

The incoming Instagram/Make flow and outgoing Meta conversion events are separate. `MAKE_WEBHOOK_URL` is optional; the Integrations page reports when it is absent. Events have a stable `eventId` for the downstream receiver to deduplicate. Failed outgoing events are recorded for investigation. Telegram retries claim messages atomically and check the parent's current link. Manual retry controls can send real messages; use only for deliberate operational recovery.

Keep backups outside the repository, access-restricted, and periodically repeat the restore drill. The scripts are manual tools and do not imply an automatic backup schedule.


## Parent reports — 2026-10-04

Migration `20261004150000_parent_reports` is additive and keeps original report values. New lesson rosters are snapshots: cancelled lessons are excluded; missing reports are not absences. Historical rosters are not backfilled. Teachers save the lesson topic/material/assignment, then individual attendance/homework/comment. Changes require a reason and the expected version; history stores before/after and the editor. Reports and their Telegram outbox rows commit in one transaction. A correction retires older unsent versions. Delivery means accepted by Telegram, not read by the parent.

Parents use `/settings` in the existing bot to select RU/UZ/both and enable/disable weekly summaries. These preferences affect lesson/weekly reports; other existing service notifications keep their existing templates. Until selection, both languages remain. Free-text topics/comments keep the teacher's language. Admins can edit these preferences in a student card. No reports are sent to an unlinked or archived recipient.

Cron `/api/cron/parent-reports` requires `CRON_SECRET`. `vercel.json` runs it daily at 04:00 UTC (09:00–10:00 Samarkand on Hobby's approximate schedule). It snapshots that day's roster, queues the previous complete tracked week (idempotent per parent/student/group/week), and drains eligible new delivery attempts within a bounded runtime. Normal lesson sends happen immediately via `after`; recovery is daily or manual. Rows predating this release default to `autoRetry=false` to avoid historical bulk mail. Weekly summaries are generated only when the entire week starts on/after `trackingStartsOn`; later daily runs can recover a missed Monday without duplicating messages.

After a clean deployment and dry-run check, enable the `ReportAutomation` row `parent-reports`. It starts disabled so migration/build verification never sends messages. GET with `?dryRun=1` and the cron authorization header is read-only. The admin Parent Reports page is also a preview and never queues messages. Tests use a local `_test` database and mocked Telegram, never live parent chats.

Monitor `lastSuccessAt` and the delivery log. A daily job cannot promise minute-level retries. Telegram network timeouts can leave an ambiguous delivery outcome; there is no claim of externally guaranteed exactly-once delivery. Queue rows retain the error and bounded retry count.
