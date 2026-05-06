import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/components/Logoutbutton";
import AdminSidebarNav from "@/components/AdminSidebarNav";

export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, name: true },
  });

  if (!user) redirect("/login");

  // Оба роля имеют доступ к /admin
  if (user.role !== "ADMIN" && user.role !== "DIRECTOR") {
    redirect(`/${user.role.toLowerCase()}`);
  }

  const isDirector = user.role === "DIRECTOR";

  return (
    <div className="min-h-screen flex bg-gray-100">
      <aside className="w-64 bg-white shadow-lg h-screen sticky top-0 relative flex flex-col">
        <div className="px-6 py-6 border-b border-gray-100">
          <Image src="/logo.png" alt="EIT LC CRM" width={160} height={54} className="object-contain" priority />
        </div>

        {/* Role badge */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              {user.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900 truncate">{user.name}</p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isDirector
                  ? "bg-purple-100 text-purple-700"
                  : "bg-blue-100 text-blue-700"
              }`}>
                {isDirector ? "Director" : "Admin"}
              </span>
            </div>
          </div>
        </div>

        <AdminSidebarNav isDirector={isDirector} />

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 p-10">{children}</main>
    </div>
  );
}