# EIT OS · CRM

Next.js / React / Prisma / PostgreSQL. Brand assets and locally hosted Manrope fonts are copied from the EIT OS landing project.

## Local development

Use a separate development database. `.env` and `.env.local` are private and never committed. Existing local environment files may point to production: explicitly override **both** `DATABASE_URL` and `DIRECT_URL` for tests.

```sh
npm ci
npx prisma migrate deploy
npm run dev
```

Required: `DATABASE_URL`, `DIRECT_URL`. Integrations: `WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. Optional `MAKE_WEBHOOK_URL` sends lead lifecycle events to a separate Make receiver; it must not point to the incoming CRM leads endpoint. `CRON_SECRET` is required to enable automated Telegram retries. No retry schedule is enabled by default.

## Validation

```sh
DATABASE_URL=postgresql://localhost/eit_crm_upgrade_test DIRECT_URL=postgresql://localhost/eit_crm_upgrade_test TELEGRAM_BOT_TOKEN='' MAKE_WEBHOOK_URL='' npm test
npm run lint
npm run build
```

Integration tests refuse non-local databases or names without `_test`. They create and remove their own synthetic rows and mock Telegram delivery. Restore a backup into an empty test database and apply migrations before running them. Never test outgoing notifications against real parent chats.

## Access and data

- Director: all sections, finance analytics, expenses, staff and audit.
- Administrator: daily operations, students, groups, leads, attendance, payments and integrations.
- Teacher: own groups, students, attendance and reports.
- Support: additional learning sessions.

Sessions are random tokens stored as hashes in PostgreSQL. Old `userId`/`userRole` cookies grant no access. Changing a role/password or disabling an account revokes its sessions. Login rate limits are shared across instances.

Attendance is unique per student **and group** per day. Payments are unique per student **and group** per billing month. The received amount field is a cumulative total, not an extra installment. Financial analytics is by billing period, not a cash-flow report by receipt date. Archives preserve history. Group membership changes and payment corrections are audited.

Incoming Instagram leads use `/api/leads/webhook`, authenticated with `Authorization: Bearer <WEBHOOK_SECRET>`. Meta lead IDs are unique and retries are safe. `dryRun: true` validates without saving. Directors can edit form-to-course mappings in Integrations.

## Operations

See [deployment and recovery](docs/operations.md). Do not run seeds against production. Never commit secrets, private database dumps, or exported student data.
