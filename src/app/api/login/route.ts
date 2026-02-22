import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const cookieStore = await cookies(); // ✅ REQUIRED
    const isProd = process.env.NODE_ENV === "production";
    const maxAge = 60 * 60 * 24 * 30;

    cookieStore.set("userId", user.id, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: isProd,
      maxAge,
    });

    cookieStore.set("userRole", user.role, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: isProd,
      maxAge,
    });

    return NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (e) {
    console.error("LOGIN_ERROR:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
