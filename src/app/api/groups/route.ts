import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function POST(request: Request) {
  try {
    const { name, schedule, startTime, endTime, programId, teacherId } =
      await request.json();

    if (!name || !schedule || !startTime || !endTime || !programId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const group = await prisma.group.create({
      data: {
        name,
        schedule,
        startTime,
        endTime,
        programId,
        teacherId: teacherId || null,
        month: 1,
      },
    });

    return NextResponse.json(group);
  } catch {
    return NextResponse.json(
      { error: "Failed to create group" },
      { status: 500 }
    );
  }
}
