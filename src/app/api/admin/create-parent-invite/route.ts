import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function randomCode(len = 10) {
  // короткий, безопасный, без спецсимволов
  return crypto.randomBytes(16).toString("hex").slice(0, len);
}

export async function POST(req: Request) {
  // простая защита (чтобы не могли дергать все подряд)
  const adminSecret = req.headers.get("x-admin-secret");
  if (!adminSecret || adminSecret !== process.env.ADMIN_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const studentId = body?.studentId as string | undefined;

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  // убеждаемся что student существует
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, name: true },
  });

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // создаём invite
  // если коллизия по code — просто повторим пару раз
  for (let i = 0; i < 5; i++) {
    const code = `eit${randomCode(10)}`;

    try {
      const invite = await prisma.parentInvite.create({
        data: {
          code,
          status: "ACTIVE",
          studentId: student.id,
        },
      });

      return NextResponse.json({
        ok: true,
        inviteId: invite.id,
        code: invite.code,
      });
    } catch {
      // collision, try again
    }
  }

  return NextResponse.json({ error: "Failed to generate code" }, { status: 500 });
}
