import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// TODO: здесь должна быть твоя реальная проверка авторизации (cookie/session)
// Сейчас минимально: требуем x-admin-secret, но это сервер-сервер.
// Для UI позже заменим на проверку logged-in ADMIN.
function randomCode(len = 10) {
  return crypto.randomBytes(16).toString("hex").slice(0, len);
}

export async function POST(req: Request) {
  // Временная защита (пока не подключили нормальную проверку сессии)
  const adminSecret = req.headers.get("x-admin-secret");
  if (!adminSecret || adminSecret !== process.env.ADMIN_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const studentId = body?.studentId as string | undefined;

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true },
  });

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  for (let i = 0; i < 5; i++) {
    const code = `eit${randomCode(10)}`;
    try {
      const invite = await prisma.parentInvite.create({
        data: { code, status: "ACTIVE", studentId: student.id },
      });

      return NextResponse.json({ ok: true, code: invite.code });
    } catch {}
  }

  return NextResponse.json({ error: "Failed to generate code" }, { status: 500 });
}
