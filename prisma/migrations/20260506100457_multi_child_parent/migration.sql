/*
  Warnings:
  - A unique constraint covering the columns `[sessionId,parentId]` on the table `TelegramPendingLink` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `sessionId` to the `TelegramPendingLink` table without a default value. This is not possible if the table is not empty.
*/
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DIRECTOR';
-- DropIndex
DROP INDEX "Parent_telegramId_key";
-- DropIndex
DROP INDEX "TelegramPendingLink_chatId_key";
-- AlterTable
ALTER TABLE "TelegramPendingLink" ADD COLUMN "sessionId" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT;
-- CreateTable
CREATE TABLE "Expense" (
"id" TEXT NOT NULL,
"amount" INTEGER NOT NULL,
"category" TEXT NOT NULL,
"description" TEXT,
"date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"createdById" TEXT,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
-- CreateIndex
CREATE INDEX "Parent_phone_idx" ON "Parent"("phone");
-- CreateIndex
CREATE INDEX "Parent_telegramId_idx" ON "Parent"("telegramId");
-- CreateIndex
CREATE INDEX "TelegramPendingLink_chatId_status_idx" ON "TelegramPendingLink"("chatId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "TelegramPendingLink_sessionId_parentId_key" ON "TelegramPendingLink"("sessionId", "parentId");
-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;