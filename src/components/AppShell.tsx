"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Layers,
  Wallet,
  Contact,
  ChartNoAxesCombined,
  Receipt,
  Shield,
  Radio,
  History,
  Menu,
  X,
  GraduationCap,
  ClipboardCheck,
} from "lucide-react";
import LogoutButton from "./Logoutbutton";
const allLinks = [
  ["/admin", "Обзор", LayoutDashboard],
  ["/admin/leads", "Лиды", Contact],
  ["/admin/students", "Ученики", Users],
  ["/admin/groups", "Группы", Layers],
  ["/admin/timetable", "Расписание", CalendarDays],
  ["/admin/attendance", "Посещаемость", ClipboardCheck],
  ["/admin/payments", "Оплаты", Wallet],
  ["/admin/support", "Поддержка", GraduationCap],
  ["/admin/analytics", "Аналитика", ChartNoAxesCombined],
  ["/admin/expenses", "Расходы", Receipt],
  ["/admin/users", "Сотрудники", Shield],
  ["/admin/telegram-status", "Интеграции", Radio],
  ["/admin/audit", "Журнал действий", History],
] as const;
const directorLinks = [
  "/admin/analytics",
  "/admin/expenses",
  "/admin/users",
  "/admin/audit",
];
const roleLabels: Record<string, string> = {
  DIRECTOR: "Директор",
  ADMIN: "Администратор",
  TEACHER: "Преподаватель",
  SUPPORT: "Поддержка",
};
export default function AppShell({
  user,
  children,
}: {
  user: { name: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links =
    user.role === "TEACHER"
      ? ([
          ["/teacher", "Мои занятия", Layers],
          ["/teacher/students", "Мои ученики", Users],
          ["/teacher/reports", "Отчёты", ClipboardCheck],
        ] as const)
      : user.role === "SUPPORT"
        ? ([["/support", "Занятия поддержки", GraduationCap]] as const)
        : allLinks.filter(
            (l) => user.role === "DIRECTOR" || !directorLinks.includes(l[0]),
          );
  const title =
    [...links]
      .reverse()
      .find((l) => pathname === l[0] || pathname.startsWith(l[0] + "/"))?.[1] ||
    "EIT OS";
  return (
    <div className="app-shell">
      {open && (
        <button
          className="nav-overlay"
          aria-label="Закрыть меню"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Link href={links[0][0]} className="brand">
          <Image
            src="/brand/eit-logo-white.svg"
            width={6479}
            height={1440}
            alt="EIT — Excellence in Teaching"
            priority
          />
          <small>OPERATING SYSTEM</small>
        </Link>
        <div className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav>
          {links.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={
                pathname === href ||
                (href.split("/").length > 2 && pathname.startsWith(href + "/"))
                  ? "active"
                  : ""
              }
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{user.name.charAt(0)}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{roleLabels[user.role]}</small>
          </div>
        </div>
        <LogoutButton />
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label="Меню"
          >
            {open ? <X /> : <Menu />}
          </button>
          <span>
            EIT OS <span className="breadcrumb">/ {title}</span>
          </span>
          <span className="workspace-tag">УЧЕБНЫЙ ЦЕНТР</span>
        </header>
        <main className="main-content">{children}</main>
        <footer className="workspace-footer">
          EIT · Excellence in Teaching<span>Время: Самарканд · UTC+5</span>
        </footer>
      </div>
    </div>
  );
}
