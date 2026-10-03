-- AlterTable
ALTER TABLE "Parent" ADD COLUMN     "reportLanguage" TEXT NOT NULL DEFAULT 'BOTH',
ADD COLUMN     "weeklyReports" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "assignment" TEXT,
ADD COLUMN     "covered" TEXT,
ADD COLUMN     "topic" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "TelegramDelivery" ADD COLUMN     "autoRetry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "sourceVersion" INTEGER;

-- CreateTable
CREATE TABLE "ReportRevision" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "topic" TEXT,
    "covered" TEXT,
    "assignment" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonStudent" (
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "LessonStudent_pkey" PRIMARY KEY ("lessonId","studentId")
);

-- CreateTable
CREATE TABLE "ReportAutomation" (
    "id" TEXT NOT NULL DEFAULT 'parent-reports',
    "trackingStartsOn" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "ReportAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportRevision_reportId_version_key" ON "ReportRevision"("reportId", "version");

-- CreateIndex
CREATE INDEX "Lesson_dateKey_idx" ON "Lesson"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_groupId_dateKey_key" ON "Lesson"("groupId", "dateKey");

-- CreateIndex
CREATE INDEX "LessonStudent_studentId_idx" ON "LessonStudent"("studentId");

-- AddForeignKey
ALTER TABLE "ReportRevision" ADD CONSTRAINT "ReportRevision_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonStudent" ADD CONSTRAINT "LessonStudent_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonStudent" ADD CONSTRAINT "LessonStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Start tracking only from rollout. Historical rosters cannot be reconstructed.
INSERT INTO "ReportAutomation" (id, "trackingStartsOn") VALUES ('parent-reports', TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Samarkand', 'YYYY-MM-DD'));
