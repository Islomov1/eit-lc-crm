import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex bg-gray-100">

      {/* SIDEBAR */}
      <aside className="w-72 bg-white flex flex-col shadow-lg">

        {/* LOGO */}
        <div className="px-6 py-8">
          <Image
            src="/logo.png"
            alt="EIT LC CRM"
            width={180}
            height={60}
            className="object-contain"
            priority
          />
        </div>

        {/* NAVIGATION */}
        <nav className="flex-1 px-4 space-y-2 text-sm font-medium">

          <SidebarLink href="/admin">
            Dashboard
          </SidebarLink>

          <SidebarLink href="/admin/students">
            Students
          </SidebarLink>

          <SidebarLink href="/admin/users">
            Users
          </SidebarLink>

        </nav>

        {/* LOGOUT BUTTON */}
        <div className="p-6 mt-auto">
          <form action="/api/logout" method="POST">
            <button
              className="
                w-full
                flex items-center justify-center gap-2
                py-4
                rounded-2xl
                bg-red-600
                text-white
                font-semibold
                hover:bg-red-700
                transition
                shadow-md
              "
            >
              Logout
            </button>
          </form>
        </div>

      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-12">
        {children}
      </main>

    </div>
  );
}

/* ================= SIDEBAR LINK ================= */

function SidebarLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="
        block
        px-4 py-3
        rounded-xl
        text-gray-700
        hover:bg-gray-100
        hover:text-black
        transition
      "
    >
      {children}
    </Link>
  );
}