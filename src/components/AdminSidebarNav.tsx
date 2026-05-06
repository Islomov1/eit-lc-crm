"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_LINKS = [
  { href: "/admin",                  label: "Dashboard" },
  { href: "/admin/timetable",        label: "Timetable" },
  { href: "/admin/groups",           label: "Groups" },
  { href: "/admin/students",         label: "Students" },
  { href: "/admin/payments",         label: "Payments" },
  { href: "/admin/leads",            label: "Leads" },
  { href: "/admin/analytics",        label: "Analytics" },
  { href: "/admin/expenses",         label: "Expenses" },
  { href: "/admin/users",            label: "Users" },
  { href: "/admin/telegram-status",  label: "Telegram Status" },
];

const DIRECTOR_ONLY_LABELS = ["Analytics", "Expenses"];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminSidebarNav({ isDirector = false }: { isDirector?: boolean }) {
  const pathname = usePathname();

  const links = ADMIN_LINKS.filter((l) => {
    if (!isDirector && DIRECTOR_ONLY_LABELS.includes(l.label)) return false;
    return true;
  });

  return (
    <nav className="flex-1 px-4 py-4 space-y-1 text-sm font-medium overflow-y-auto pb-28">
      {links.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? "block px-4 py-2.5 rounded-xl bg-gray-100 text-black font-semibold"
                : "block px-4 py-2.5 rounded-xl text-gray-700 hover:bg-gray-100 hover:text-black transition"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}