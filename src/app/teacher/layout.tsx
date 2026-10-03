import { requireRole } from "@/lib/auth";
import AppShell from "@/components/AppShell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("TEACHER");
  return <AppShell user={user}>{children}</AppShell>;
}
