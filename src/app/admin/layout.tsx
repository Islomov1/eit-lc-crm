import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/components/Logoutbutton";
import AdminSidebarNav from "@/components/AdminSidebarNav";

export const dynamic = "force-dynamic";

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
    select: { role: true },
  });

  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect(`/${user.role.toLowerCase()}`);

  return (
    <div className="min-h-screen flex bg-gray-100">
      <aside className="w-72 bg-white shadow-lg h-screen sticky top-0 relative">
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

  <AdminSidebarNav />

  <div className="absolute bottom-0 left-0 right-0 p-6 bg-white">
    <LogoutButton />
  </div>
</aside>

      <main className="flex-1 p-12">{children}</main>
    </div>
  );
}

