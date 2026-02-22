// prisma/seed.ts
import bcrypt from "bcryptjs";

// CJS-compatible import for Prisma when ts-node runs in ESM mode
import prismaPkg from "@prisma/client";
const {
  PrismaClient,
  Role,
  ScheduleType,
  GroupStatus,
  AttendanceStatus,
  HomeworkStatus,
} = prismaPkg;

const prisma = new PrismaClient();

function dateKey(d = new Date()) {
  // YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("🌱 Starting full EIT LC CRM seed...");

  const dk = dateKey();

  /* ================= USERS ================= */
  const adminPassword = await bcrypt.hash("admin123", 10);
  const teacherPassword = await bcrypt.hash("teacher123", 10);
  const supportPassword = await bcrypt.hash("support123", 10);

  await prisma.user.upsert({
    where: { email: "admin@eitlc.com" },
    update: {},
    create: {
      name: "EIT Admin",
      email: "admin@eitlc.com",
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  const teacher1 = await prisma.user.upsert({
    where: { email: "teacher1@eitlc.com" },
    update: {},
    create: {
      name: "John Smith",
      email: "teacher1@eitlc.com",
      password: teacherPassword,
      role: Role.TEACHER,
    },
  });

  const teacher2 = await prisma.user.upsert({
    where: { email: "teacher2@eitlc.com" },
    update: {},
    create: {
      name: "Anna Lee",
      email: "teacher2@eitlc.com",
      password: teacherPassword,
      role: Role.TEACHER,
    },
  });

  const support = await prisma.user.upsert({
    where: { email: "support@eitlc.com" },
    update: {},
    create: {
      name: "Academic Support",
      email: "support@eitlc.com",
      password: supportPassword,
      role: Role.SUPPORT,
    },
  });

  /* ================= PROGRAMS ================= */
  const programNames = ["A1", "A2", "B1", "B2", "C1", "IELTS", "SAT", "MATHS", "CUSTOM"];

  const programs: Record<string, { id: string; name: string }> = {};

  for (const name of programNames) {
    const p = await prisma.program.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    programs[name] = { id: p.id, name: p.name };
  }

  /* ================= GROUPS ================= */
  const groupA1 = await prisma.group.create({
    data: {
      name: "A1 Morning",
      schedule: ScheduleType.MWF,
      startTime: "09:00",
      endTime: "10:30",
      month: 1,
      status: GroupStatus.ACTIVE,
      programId: programs["A1"].id,
      teacherId: teacher1.id,
    },
  });

  const groupIELTS = await prisma.group.create({
    data: {
      name: "IELTS Pro",
      schedule: ScheduleType.TTS,
      startTime: "17:00",
      endTime: "18:30",
      month: 2,
      status: GroupStatus.NEW,
      programId: programs["IELTS"].id,
      teacherId: teacher2.id,
    },
  });

  /* ================= STUDENTS ================= */
  const ali = await prisma.student.create({
    data: { name: "Ali Karimov", groupId: groupA1.id },
  });

  const madina = await prisma.student.create({
    data: { name: "Madina Saidova", groupId: groupIELTS.id },
  });

  const aziz = await prisma.student.create({
    data: { name: "Aziz Nurmatov", groupId: groupA1.id },
  });

  /* ================= PARENTS ================= */
  await prisma.parent.createMany({
    data: [
      {
        name: "Karim Karimov",
        phone: "+998901112233",
        telegramId: BigInt("123456789"),
        studentId: ali.id,
      },
      {
        name: "Dilnoza Karimova",
        phone: "+998901114455",
        telegramId: null,
        studentId: ali.id,
      },
      {
        name: "Said Saidov",
        phone: "+998909998877",
        telegramId: BigInt("987654321"),
        studentId: madina.id,
      },
      {
        name: "Nurmat Nurmatov",
        phone: "+998901234567",
        telegramId: BigInt("555555555"),
        studentId: aziz.id,
      },
    ],
  });

  /* ================= REPORTS ================= */
  await prisma.report.create({
    data: {
      studentId: ali.id,
      teacherId: teacher1.id,
      groupId: groupA1.id,
      dateKey: dk,
      attendance: AttendanceStatus.PRESENT,
      homework: HomeworkStatus.DONE,
      comment: "Excellent participation and active engagement.",
    },
  });

  await prisma.report.create({
    data: {
      studentId: madina.id,
      teacherId: teacher2.id,
      groupId: groupIELTS.id,
      dateKey: dk,
      attendance: AttendanceStatus.ABSENT,
      homework: HomeworkStatus.NOT_DONE,
      comment: "Student was absent. Homework not submitted.",
    },
  });

  /* ================= SUPPORT SESSION ================= */
  await prisma.supportSession.create({
    data: {
      studentId: ali.id,
      supportId: support.id,
      startTime: new Date(),
      endTime: new Date(Date.now() + 60 * 60 * 1000),
      comment: "Revision of grammar topics and vocabulary practice.",
    },
  });

  console.log("✅ Seed completed.");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
