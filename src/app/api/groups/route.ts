import { apiUser, sameOrigin } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
  const user = await apiUser(["ADMIN", "DIRECTOR"]);
  if (!sameOrigin(request) || !user)
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 255 ||
    !["MWF", "TTS"].includes(body.schedule) ||
    typeof body.programId !== "string" ||
    ![body.startTime, body.endTime].every(
      (t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t),
    ) ||
    body.startTime >= body.endTime
  )
    return NextResponse.json(
      { error: "Проверьте название, курс и расписание" },
      { status: 400 },
    );
  if (
    body.teacherId &&
    !(await prisma.user.findFirst({
      where: { id: body.teacherId, role: "TEACHER", disabledAt: null },
    }))
  )
    return NextResponse.json(
      { error: "Преподаватель недоступен" },
      { status: 400 },
    );
  if (!(await prisma.program.findUnique({ where: { id: body.programId } })))
    return NextResponse.json({ error: "Курс не найден" }, { status: 400 });
  try {
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: {
          name: body.name.trim(),
          schedule: body.schedule,
          startTime: body.startTime,
          endTime: body.endTime,
          programId: body.programId,
          teacherId: body.teacherId || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name,
          action: "CREATE",
          entity: "Group",
          entityId: g.id,
          summary: `Создана группа ${g.name}`,
        },
      });
      return g;
    });
    return NextResponse.json(group);
  } catch {
    return NextResponse.json(
      { error: "Не удалось создать группу" },
      { status: 500 },
    );
  }
}
