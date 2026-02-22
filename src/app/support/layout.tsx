import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/components/Logoutbutton";

export const dynamic = "force-dynamic";

export default async function SupportLayout({
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

  if (!user || user.role !== "SUPPORT") {
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
          <SidebarLink href="/support">Support Sessions</SidebarLink>
        </nav>

        {/* LOGOUT */}
        <div className="p-6 mt-auto">
          <LogoutButton />
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-12">{children}</main>
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