/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Group` table. All the data in the column will be lost.
  - You are about to drop the column `stage` on the `Group` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Program` table. All the data in the column will be lost.
  - Made the column `programId` on table `Group` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('NEW', 'ACTIVE', 'FINISHING', 'EXPIRED');

-- DropForeignKey
ALTER TABLE "Group" DROP CONSTRAINT "Group_programId_fkey";

-- DropIndex
DROP INDEX "Program_name_key";

-- AlterTable
ALTER TABLE "Group" DROP COLUMN "createdAt",
DROP COLUMN "stage",
ADD COLUMN     "month" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" "GroupStatus" NOT NULL DEFAULT 'NEW',
ALTER COLUMN "programId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Program" DROP COLUMN "createdAt";

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
