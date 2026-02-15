/*
  Warnings:

  - A unique constraint covering the columns `[studentId,date]` on the table `Report` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Report_studentId_date_key" ON "Report"("studentId", "date");
