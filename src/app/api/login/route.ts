import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();

    // 🔥 ЯВНО ПРИВОДИМ К СТРОКЕ
    cookieStore.set("userId", String(user.id), {
      httpOnly: true,
      path: "/",
    });

    cookieStore.set("userRole", user.role.toString().trim(), {
      httpOnly: true,
      path: "/",
    });

    console.log("LOGIN ROLE:", user.role);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    });
  } catch {
    console.error();
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}