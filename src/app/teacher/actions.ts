"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { textField } from "@/lib/format";
import { saveLessonReport } from "@/lib/attendance";
import { saveLessonDetails } from "@/lib/lessons";
import { deliverReport } from "@/lib/telegramDelivery";
import type { AttendanceStatus, HomeworkStatus } from "@prisma/client";
export async function saveReportAction(f: FormData) {
  const actor = await requireRole("TEACHER", "ADMIN", "DIRECTOR");
  const report = await saveLessonReport(
    {
      studentId: textField(f, "studentId"),
      groupId: textField(f, "groupId"),
      dateKey: textField(f, "dateKey"),
      attendance: textField(f, "attendance") as AttendanceStatus,
      homework: textField(f, "homework") as HomeworkStatus,
      comment: textField(f, "comment", 1200),
      ...(f.has("topic")
        ? {
            topic: textField(f, "topic", 180),
            covered: textField(f, "covered", 500),
            assignment: textField(f, "assignment", 600),
          }
        : {}),
      expectedVersion: Number(f.get("version") || 0),
      reason: textField(f, "reason", 300),
    },
    actor,
  );
  after(() => deliverReport(report.id, report.version));
  for (const path of [
    "/teacher",
    "/teacher/reports",
    "/admin/attendance",
    "/admin/parent-reports",
    "/admin/students/" + report.studentId,
  ])
    revalidatePath(path);
}
export async function saveLessonAction(f: FormData) {
  const actor = await requireRole("TEACHER", "ADMIN", "DIRECTOR");
  await saveLessonDetails(
    {
      groupId: textField(f, "groupId"),
      dateKey: textField(f, "dateKey"),
      topic: textField(f, "topic", 180),
      covered: textField(f, "covered", 500),
      assignment: textField(f, "assignment", 600),
      cancel: f.get("cancel") === "1",
      reason: textField(f, "reason", 300),
    },
    actor,
  );
  revalidatePath("/teacher");
  revalidatePath("/admin/parent-reports");
}
