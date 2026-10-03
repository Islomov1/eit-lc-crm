-- DropIndex
DROP INDEX "Report_studentId_dateKey_key";

-- DropIndex
DROP INDEX "Payment_studentId_periodStart_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "disabledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "monthlyFee" INTEGER NOT NULL DEFAULT 750000;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "paidAmount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "lossReason" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "studentId" TEXT,
ADD COLUMN     "trialAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadForm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "program" TEXT NOT NULL,

    CONSTRAINT "LeadForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationError" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_expiresAt_idx" ON "LoginAttempt"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationError_resolvedAt_createdAt_idx" ON "IntegrationError"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Group_teacherId_schedule_archivedAt_idx" ON "Group"("teacherId", "schedule", "archivedAt");

-- CreateIndex
CREATE INDEX "Student_archivedAt_createdAt_idx" ON "Student"("archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Report_dateKey_attendance_idx" ON "Report"("dateKey", "attendance");

-- CreateIndex
CREATE UNIQUE INDEX "Report_studentId_groupId_dateKey_key" ON "Report"("studentId", "groupId", "dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_studentId_groupId_periodStart_key" ON "Payment"("studentId", "groupId", "periodStart");

-- CreateIndex
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_source_createdAt_idx" ON "Lead"("source", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_ownerId_followUpAt_idx" ON "Lead"("ownerId", "followUpAt");

-- CreateIndex
CREATE INDEX "Lead_studentId_idx" ON "Lead"("studentId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Preserve legacy totals. Partial rows require reconciliation: their received amount was never recorded.
UPDATE "Payment" SET "paidAmount" = "amount" WHERE "status" = 'PAID';
UPDATE "Payment" SET "note" = concat_ws(E'\n', "note", 'Требует сверки: у старой частичной оплаты не указана полученная сумма.') WHERE "status" = 'PARTIAL';
CREATE UNIQUE INDEX "Payment_student_null_group_period_key" ON "Payment" ("studentId", "periodStart") WHERE "groupId" IS NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_nonnegative" CHECK ("paidAmount" >= 0);
INSERT INTO "LeadForm" ("id", "name", "program") VALUES
('1410025207940063','SAT offline','SAT'),('1796584998003892','KIDS','Kids'),
('1815674192895948','Multi-level','Multi-level'),('1582198567019319','SAT online','SAT online'),
('4509120942667335','SAT 25.08','SAT'),('27752876177680395','IELTS 01.07','IELTS'),
('1472555127965961','Multi-level 27.06','Multi-level'),('997567146335690','CEFR 27.06','CEFR');
