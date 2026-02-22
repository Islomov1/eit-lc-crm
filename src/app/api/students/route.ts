import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("userRole")?.value;

    if (!userId || !role) return forbidden();
    // Decide your rules:
    // Admin + Support can see all, Teacher maybe only their group students (needs more logic)
    if (role !== "ADMIN" && role !== "SUPPORT") return forbidden();

    const students = await prisma.student.findMany({
      include: { group: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(students);
  } catch (err) {
    console.error("STUDENTS_GET_ERROR:", err);
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("userRole")?.value;

    if (!userId || !role) return forbidden();
    if (role !== "ADMIN" && role !== "SUPPORT") return forbidden();

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const student = await prisma.student.create({
      data: { name },
    });

    return NextResponse.json(student);
  } catch (err) {
    console.error("STUDENTS_POST_ERROR:", err);
    return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
  }
}
