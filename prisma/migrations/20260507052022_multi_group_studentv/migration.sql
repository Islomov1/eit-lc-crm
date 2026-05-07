/*
  Warnings:
  - You are about to drop the column `groupId` on the `Student` table. All the data in the column will be lost.
*/
-- CreateTable
CREATE TABLE "_GroupToStudent" (
"A" TEXT NOT NULL,
"B" TEXT NOT NULL
);
-- CreateIndex
CREATE UNIQUE INDEX "_GroupToStudent_AB_unique" ON "_GroupToStudent"("A", "B");
-- CreateIndex
CREATE INDEX "_GroupToStudent_B_index" ON "_GroupToStudent"("B");
-- AddForeignKey
ALTER TABLE "_GroupToStudent" ADD CONSTRAINT "_GroupToStudent_A_fkey" FOREIGN KEY ("A") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "_GroupToStudent" ADD CONSTRAINT "_GroupToStudent_B_fkey" FOREIGN KEY ("B") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Migrate existing groupId data into the join table
INSERT INTO "_GroupToStudent" ("A", "B")
SELECT "groupId", "id" FROM "Student" WHERE "groupId" IS NOT NULL;
-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_groupId_fkey";
-- AlterTable
ALTER TABLE "Student" DROP COLUMN "groupId";