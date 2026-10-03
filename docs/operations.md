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
