import { NextResponse, type NextRequest } from "next/server";
export function middleware(req: NextRequest) {
  if (!req.cookies.get("eit_session")?.value) return NextResponse.redirect(new URL("/login", req.url));
  // Database-backed identity and role checks run in every page, action and API handler.
  return NextResponse.next();
}
export const config = { matcher: ["/admin/:path*", "/teacher/:path*", "/support/:path*"] };
