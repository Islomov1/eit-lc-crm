import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

export async function POST(request: Request) {
  try {
const body = (await request.json()) as {
  name?: string;
  schedule?: "MWF" | "TTS";
  startTime?: string;
  endTime?: string;
  programId?: string;
  teacherId?: string | null;
};

const { name, schedule, startTime, endTime, programId, teacherId } = body;

if (!name || !schedule || !startTime || !endTime || !programId) {
  return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
}


const group = await prisma.group.create({
  data: {
    name,
    schedule,
    startTime,
    endTime,
    month: 1,

    program: {
      connect: { id: programId },
    },

    ...(teacherId
      ? { teacher: { connect: { id: teacherId } } }
      : {}),
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
