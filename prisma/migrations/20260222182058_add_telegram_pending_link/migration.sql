/*
  Warnings:

  - The `telegramId` column on the `Parent` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[telegramId]` on the table `Parent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[studentId,dateKey]` on the table `Report` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `dateKey` to the `Report` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TelegramUpdateStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'ERROR');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TelegramDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- DropIndex
DROP INDEX "Report_studentId_date_key";

-- AlterTable
ALTER TABLE "Parent" DROP COLUMN "telegramId",
ADD COLUMN     "telegramId" BIGINT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "dateKey" TEXT NOT NULL;

-- DropEnum
DROP TYPE "GroupStage";

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "id" TEXT NOT NULL,
    "updateId" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "TelegramUpdateStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "TelegramUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "studentId" TEXT NOT NULL,
    "createdById" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ParentInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "actorType" TEXT,
    "actorId" TEXT,
    "groupId" TEXT,
    "studentId" TEXT,
    "props" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramPendingLink" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TelegramPendingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramDelivery" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "messageText" TEXT NOT NULL,
    "parseMode" TEXT,
    "actorType" TEXT,
    "actorId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TelegramDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "telegramMessageId" INTEGER,
    "error" TEXT,
    "errorPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdate_updateId_key" ON "TelegramUpdate"("updateId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentInvite_code_key" ON "ParentInvite"("code");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_studentId_idx" ON "AnalyticsEvent"("studentId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_groupId_idx" ON "AnalyticsEvent"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPendingLink_chatId_key" ON "TelegramPendingLink"("chatId");

-- CreateIndex
CREATE INDEX "TelegramPendingLink_parentId_idx" ON "TelegramPendingLink"("parentId");

-- CreateIndex
CREATE INDEX "TelegramPendingLink_studentId_idx" ON "TelegramPendingLink"("studentId");

-- CreateIndex
CREATE INDEX "TelegramPendingLink_status_idx" ON "TelegramPendingLink"("status");

-- CreateIndex
CREATE INDEX "TelegramDelivery_status_nextRetryAt_idx" ON "TelegramDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "TelegramDelivery_studentId_createdAt_idx" ON "TelegramDelivery"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramDelivery_parentId_createdAt_idx" ON "TelegramDelivery"("parentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramDelivery_parentId_idempotencyKey_key" ON "TelegramDelivery"("parentId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_telegramId_key" ON "Parent"("telegramId");

-- CreateIndex
CREATE INDEX "Parent_studentId_idx" ON "Parent"("studentId");

-- CreateIndex
CREATE INDEX "Report_groupId_dateKey_idx" ON "Report"("groupId", "dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "Report_studentId_dateKey_key" ON "Report"("studentId", "dateKey");

-- AddForeignKey
ALTER TABLE "ParentInvite" ADD CONSTRAINT "ParentInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentInvite" ADD CONSTRAINT "ParentInvite_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentInvite" ADD CONSTRAINT "ParentInvite_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPendingLink" ADD CONSTRAINT "TelegramPendingLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramPendingLink" ADD CONSTRAINT "TelegramPendingLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramDelivery" ADD CONSTRAINT "TelegramDelivery_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramDelivery" ADD CONSTRAINT "TelegramDelivery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
