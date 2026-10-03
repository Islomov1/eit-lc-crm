import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createSession, hashToken, sameOrigin } from "@/lib/auth";
export const runtime = "nodejs";
const dummyHash =
  "$2b$10$J0olSJ2FVdtvoCyBNtv3dOAJoYs5IwzeStHRI0YYCzmPHhDDjgZ.C";
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Недопустимый запрос" }, { status: 403 });
  try {
    const body = await req.json();
    if (
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      body.email.length > 255 ||
      body.password.length > 128
    )
      return NextResponse.json({ error: "Проверьте данные" }, { status: 400 });
    const email = body.email.trim().toLowerCase();
    const key = hashToken(email);
    const now = new Date();
    // Atomic fixed window also prevents concurrent requests from bypassing the limit.
    const attempts = await prisma.$queryRaw<
      { count: number }[]
    >`INSERT INTO "LoginAttempt" ("key", "count", "expiresAt") VALUES (${key}, 1, ${new Date(now.getTime() + 900000)}) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "LoginAttempt"."expiresAt" < ${now} THEN 1 ELSE "LoginAttempt"."count" + 1 END, "expiresAt" = CASE WHEN "LoginAttempt"."expiresAt" < ${now} THEN ${new Date(now.getTime() + 900000)} ELSE "LoginAttempt"."expiresAt" END RETURNING "count"`;
    if (attempts[0].count > 10)
      return NextResponse.json(
        { error: "Слишком много попыток. Повторите через 15 минут." },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    const valid = await bcrypt.compare(
      body.password,
      user?.password || dummyHash,
    );
    if (!valid || !user || user.disabledAt)
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 },
      );
    await createSession(user.id);
    await prisma.loginAttempt.deleteMany({ where: { key } });
    await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
    return NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch {
    return NextResponse.json(
      { error: "Не удалось войти. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
