import React from "react";
import { prisma } from "@/lib/prisma";
import { GroupStatus } from "@prisma/client";

type SP = Record<string, string | string[] | undefined>;

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const programFilter = typeof sp.programId === "string" ? sp.programId : undefined;

  const statusFilter =
    typeof sp.status === "string" &&
    (Object.values(GroupStatus) as string[]).includes(sp.status)
      ? (sp.status as GroupStatus)
      : undefined;

  const teacherFilter = typeof sp.teacherId === "string" ? sp.teacherId : undefined;

  const groups = await prisma.group.findMany({
    where: {
      ...(programFilter ? { programId: programFilter } : {}),
      ...(teacherFilter ? { teacherId: teacherFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      teacher: true,
      program: true,
      students: true,
    },
    orderBy: [{ schedule: "asc" }, { startTime: "asc" }],
    take: 300,
  });

  const programs = await prisma.program.findMany({
    orderBy: { name: "asc" },
  });

  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER" },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Timetable</h1>

      <div className="bg-white p-6 rounded-2xl shadow">
        <form method="GET" className="grid grid-cols-5 gap-4">
          <select name="programId" defaultValue={programFilter || ""} className="border p-2 rounded">
            <option value="">All Programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select name="teacherId" defaultValue={teacherFilter || ""} className="border p-2 rounded">
            <option value="">All Teachers</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select name="status" defaultValue={statusFilter || ""} className="border p-2 rounded">
            <option value="">All Status</option>
            <option value="NEW">NEW</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="FINISHING">FINISHING</option>
            <option value="EXPIRED">EXPIRED</option>
          </select>

          <button className="bg-black text-white rounded-lg py-2">Apply Filters</button>

          <a
            href="/admin/timetable"
            className="border rounded-lg py-2 flex items-center justify-center hover:bg-black hover:text-white transition"
          >
            Reset
          </a>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-3">Group</th>
              <th>Program</th>
              <th>Schedule</th>
              <th>Time</th>
              <th>Teacher</th>
              <th>Students</th>
              <th>Month</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {groups.map((group) => (
              <tr key={group.id} className="border-b hover:bg-gray-50">
                <td className="py-3 font-medium">{group.name}</td>
                <td>{group.program?.name || "N/A"}</td>
                <td>{group.schedule}</td>
                <td>
                  {group.startTime} – {group.endTime}
                </td>
                <td>{group.teacher?.name ?? "Not assigned"}</td>
                <td>{group.students.length}</td>
                <td>Month {group.month}</td>
                <td>
                  {group.status === "NEW" && <Badge color="green">NEW</Badge>}
                  {group.status === "ACTIVE" && <Badge color="blue">ACTIVE</Badge>}
                  {group.status === "FINISHING" && <Badge color="orange">FINISHING</Badge>}
                  {group.status === "EXPIRED" && <Badge color="red">EXPIRED</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Badge({
  color,
  children,
}: {
  color: "green" | "blue" | "orange" | "red";
  children: React.ReactNode;
}) {
  const colors = {
    green: "bg-green-100 text-green-700",
    blue: "bg-blue-100 text-blue-700",
    orange: "bg-orange-100 text-orange-700",
    red: "bg-red-100 text-red-700",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${colors[color]}`}>
      {children}
    </span>
  );
}
