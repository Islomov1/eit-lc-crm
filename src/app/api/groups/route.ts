import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function GET() {
  try {
    const groups = await prisma.group.findMany({
      include: {
        teacher: true,
        students: true,
      },
    });

    return NextResponse.json(groups);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { name, schedule, startTime, endTime } = await req.json();

    const group = await prisma.group.create({
      data: {
        name,
        schedule,
        startTime,
        endTime,
      },
    });

    return NextResponse.json(group);
  } catch  {
    return NextResponse.json(
      { error: "Failed to create group" },
      { status: 500 }
    );
  }
}
