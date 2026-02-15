import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, ScheduleType } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      schedule?: ScheduleType;
      startTime?: string;
      endTime?: string;
      programId?: string;
      teacherId?: string | null;
    };

    const { name, schedule, startTime, endTime, programId, teacherId } = body;

    if (!name || !schedule || !startTime || !endTime || !programId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // ⬇️ КЛЮЧЕВОЙ МОМЕНТ
    const data: Prisma.GroupCreateInput = {
      name,
      schedule,
      startTime,
      endTime,
      month: 1,
      program: {
        connect: { id: programId },
      },
    };

    if (teacherId) {
      data.teacher = {
        connect: { id: teacherId },
      };
    }

    const group = await prisma.group.create({ data });

    return NextResponse.json(group);
  } catch {
    return NextResponse.json(
      { error: "Failed to create group" },
      { status: 500 }
    );
  }
}
