import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET() {
  try {
    const students = await prisma.student.findMany({
      include: {
        group: true,
      },
    });

    return NextResponse.json(students);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch students" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();

    const student = await prisma.student.create({
      data: { name },
    });

    return NextResponse.json(student);
  } catch {
    return NextResponse.json(
      { error: "Failed to create student" },
      { status: 500 }
    );
  }
}
