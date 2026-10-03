import { apiUser, sameOrigin } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

function randomCode(len = 32) {
  return crypto.randomBytes(16).toString("hex").slice(0, len);
}

export async function POST(req: Request) {
  const user = await apiUser(["ADMIN", "DIRECTOR"]);
  if (!user || !sameOrigin(req))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    const code = `eit${randomCode(32)}`;
    try {
      const invite = await prisma.parentInvite.create({
        data: {
          code,
          status: "ACTIVE",
          createdById: user.id,
          expiresAt: new Date(Date.now() + 7 * 86400000),
          studentId: student.id,
        },
      });

      return NextResponse.json({ ok: true, code: invite.code });
    } catch {}
  }

  return NextResponse.json(
    { error: "Failed to generate code" },
    { status: 500 },
  );
}
