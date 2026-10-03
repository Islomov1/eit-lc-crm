import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, hashToken, sameOrigin } from "@/lib/auth";
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token)
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  const res = NextResponse.json({ ok: true });
  for (const name of [SESSION_COOKIE, "userId", "userRole"])
    res.cookies.set(name, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
  return res;
}
