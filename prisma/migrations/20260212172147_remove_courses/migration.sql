/*
  Warnings:

  - You are about to drop the column `courseId` on the `Group` table. All the data in the column will be lost.
  - You are about to drop the `Course` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_courseId_fkey";

-- AlterTable
ALTER TABLE "Group" DROP COLUMN "courseId";

-- DropTable
DROP TABLE "Course";
