import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const cookieStore = await cookies(); // ✅ REQUIRED

  cookieStore.delete("userId");
  cookieStore.delete("userRole");

  return NextResponse.redirect(new URL("/login", req.url));
}

export async function GET(req: Request) {
  return POST(req);
}
