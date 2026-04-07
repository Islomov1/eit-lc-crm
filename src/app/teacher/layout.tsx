import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/components/Logoutbutton";
import Link from "next/link";

export const revalidate = 0;

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true },
  });

  if (!user || user.role !== "TEACHER") redirect("/");

  return (
    <div className="min-h-screen flex bg-gray-50">

      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-sm border-r border-gray-100 flex flex-col h-screen sticky top-0">

        {/* Logo */}
        <div className="px-6 py-6 border-b border-gray-100">
          <Image src="/logo.png" alt="EIT LC" width={160} height={54} className="object-contain" priority />
        </div>

        {/* User info */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-400">Teacher</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-4 space-y-1">
          <Link
            href="/teacher"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition"
          >
            <span>📚</span> My Groups
          </Link>
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-100">
          <LogoutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}