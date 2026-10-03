import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser, sameOrigin } from "@/lib/auth";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(req: Request) {
  try {
    const user = await apiUser(["ADMIN", "DIRECTOR", "SUPPORT"]);
    if (!user) return forbidden();

    const students = await prisma.student.findMany({
      where: {
        archivedAt: null,
        ...(new URL(req.url).searchParams.get("q")
          ? {
              name: {
                contains: new URL(req.url).searchParams.get("q")!,
                mode: "insensitive" as const,
              },
            }
          : {}),
      },
      take: 50,
      skip:
        Math.max(
          0,
          (Number(new URL(req.url).searchParams.get("page")) || 1) - 1,
        ) * 50,
      include: { groups: true }, // ✅ was: group
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(students);
  } catch (err) {
    console.error("STUDENTS_GET_ERROR:", err);
    return NextResponse.json(
      { error: "Failed to fetch students" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  try {
    const user = await apiUser(["ADMIN", "DIRECTOR", "SUPPORT"]);
    if (!user) return forbidden();

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 255) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const student = await prisma.student.create({
      data: { name },
    });

    return NextResponse.json(student);
  } catch (err) {
    console.error("STUDENTS_POST_ERROR:", err);
    return NextResponse.json(
      { error: "Failed to create student" },
      { status: 500 },
    );
  }
}
