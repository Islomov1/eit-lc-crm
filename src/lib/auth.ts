import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "eit_session";
export const roleHome = (role: string) =>
  role === "ADMIN" || role === "DIRECTOR"
    ? "/admin"
    : role === "TEACHER"
      ? "/teacher"
      : "/support";
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          disabledAt: true,
        },
      },
    },
  });
  return session && session.expiresAt > new Date() && !session.user.disabledAt
    ? session.user
    : null;
});
export async function requireRole(...roles: Role[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect(roleHome(user.role));
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const maxAge = 60 * 60 * 24 * 7;
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + maxAge * 1000),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  jar.delete("userId");
  jar.delete("userRole");
}
export async function apiUser(roles: Role[] = []) {
  const user = await getCurrentUser();
  return user && (!roles.length || roles.includes(user.role)) ? user : null;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = req.headers.get("host") || new URL(req.url).host;
    return (
      ["http:", "https:"].includes(parsed.protocol) && parsed.host === host
    );
  } catch {
    return false;
  }
}
export async function assertTeacherStudent(
  teacherId: string,
  studentId: string,
) {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      archivedAt: null,
      groups: { some: { teacherId, archivedAt: null } },
    },
    select: { id: true },
  });
  if (!student) throw new Error("Нет доступа к ученику");
}
