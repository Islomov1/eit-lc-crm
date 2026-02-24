"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/timetable", label: "Timetable" },
  { href: "/admin/groups", label: "Groups" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/telegram-status", label: "Telegram Status" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="px-4 space-y-2 text-sm font-medium overflow-y-auto pb-28">
      {links.map((l) => {
        const active = isActive(pathname, l.href);

        // "blank highlighting": no dark/colored highlight; just a clean light background
        const cls = active
          ? "block px-4 py-3 rounded-xl bg-gray-100 text-black"
          : "block px-4 py-3 rounded-xl text-gray-700 hover:bg-gray-100 hover:text-black transition";

        return (
          <Link key={l.href} href={l.href} className={cls}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}