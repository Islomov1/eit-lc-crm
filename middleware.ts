// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  SUPPORT: "/support",
};

function isProtected(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/teacher") ||
    pathname.startsWith("/support")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (pathname.startsWith("/login") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Only guard protected areas
  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const userId = req.cookies.get("userId")?.value;
  const role = req.cookies.get("userRole")?.value;

  // Not logged in -> login
  if (!userId || !role) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Role-based access
  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? "/", req.url));
  }

  if (pathname.startsWith("/teacher") && role !== "TEACHER") {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? "/", req.url));
  }

  if (pathname.startsWith("/support") && role !== "SUPPORT") {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? "/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/support/:path*", "/login"],
};
