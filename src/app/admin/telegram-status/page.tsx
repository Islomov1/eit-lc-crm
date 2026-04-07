import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

export const revalidate = 30;

type SP = Promise<{ q?: string; status?: string }>;

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  }).format(d);
}

export default async function TelegramStatusPage(props: { searchParams: SP }) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  if (!userId) redirect("/login");

  const admin = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!admin) redirect("/login");
  if (admin.role !== "ADMIN") redirect(`/${admin.role.toLowerCase()}`);

  const { q: rawQ, status: rawStatus } = await props.searchParams;
  const q = (rawQ ?? "").trim();
  const statusFilter = (rawStatus ?? "all").toLowerCase();

  const parents = await prisma.parent.findMany({
    include: {
      student: {
        select: {
          id: true,
          name: true,
          group: { select: { name: true } },
        },
      },
      telegramDeliveries: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          createdAt: true,
          lastAttemptAt: true,
          sentAt: true,
          error: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = parents
    .map((p) => {
      const last = p.telegramDeliveries[0] ?? null;
      const isLinked = p.telegramId !== null;
      return {
        id: p.id,
        parentName: p.name,
        phone: p.phone,
        telegramId: p.telegramId ? p.telegramId.toString() : null,
        linked: isLinked,
        studentName: p.student.name,
        groupName: p.student.group?.name ?? "—",
        deliveryStatus: last?.status ?? null,
        deliveryAt: last?.sentAt ?? last?.lastAttemptAt ?? last?.createdAt ?? null,
        error: last?.error ?? null,
      };
    })
    .filter((row) => {
      if (statusFilter === "linked" && !row.linked) return false;
      if (statusFilter === "unlinked" && row.linked) return false;
      if (!q) return true;
      return [row.parentName, row.phone, row.studentName, row.groupName, row.telegramId ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase());
    });

  const stats = {
    total: rows.length,
    linked: rows.filter((r) => r.linked).length,
    unlinked: rows.filter((r) => !r.linked).length,
    failed: rows.filter((r) => r.deliveryStatus === "FAILED").length,
  };

  return (
    <div className="space-y-8 max-w-6xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Telegram Status</h1>
        <p className="text-sm text-gray-500 mt-1">Parent link status and delivery history</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Parents" value={stats.total} />
        <StatCard label="Linked" value={stats.linked} color="green" />
        <StatCard label="Not Linked" value={stats.unlinked} color="gray" />
        <StatCard label="Failed Delivery" value={stats.failed} color={stats.failed > 0 ? "red" : "gray"} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <form className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search: parent / student / phone / group"
            className="flex-1 h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[220px]"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="h-11 border border-gray-200 rounded-xl px-4 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="all">All</option>
            <option value="linked">Linked only</option>
            <option value="unlinked">Not linked only</option>
          </select>
          <button
            type="submit"
            className="h-11 px-6 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition"
          >
            Apply
          </button>
          <Link
            href="/admin/telegram-status"
            className="h-11 px-4 flex items-center rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Reset
          </Link>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900">
            {rows.length} parent{rows.length !== 1 ? "s" : ""}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-400">Nothing found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "900px" }}>
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3">Parent</th>
                  <th className="px-6 py-3">Phone</th>
                  <th className="px-6 py-3">Student</th>
                  <th className="px-6 py-3">Group</th>
                  <th className="px-6 py-3">Link</th>
                  <th className="px-6 py-3">Telegram ID</th>
                  <th className="px-6 py-3">Last Delivery</th>
                  <th className="px-6 py-3">When</th>
                  <th className="px-6 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 align-top">
                    <td className="px-6 py-3 font-medium text-gray-900">{row.parentName}</td>
                    <td className="px-6 py-3 text-gray-600">{row.phone}</td>
                    <td className="px-6 py-3 text-gray-600">{row.studentName}</td>
                    <td className="px-6 py-3 text-gray-600">{row.groupName}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${row.linked ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {row.linked ? "✓ Linked" : "Not linked"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600 font-mono text-xs">{row.telegramId ?? "—"}</td>
                    <td className="px-6 py-3">
                      {row.deliveryStatus ? (
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          row.deliveryStatus === "SENT" ? "bg-green-100 text-green-700" :
                          row.deliveryStatus === "FAILED" ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {row.deliveryStatus}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs">{fmtDate(row.deliveryAt)}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs max-w-[200px] break-words">
                      {row.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "gray" }: { label: string; value: number; color?: "green" | "red" | "gray" }) {
  const styles = {
    green: "bg-green-50 border-green-100",
    red: "bg-red-50 border-red-100",
    gray: "bg-white border-gray-100",
  };
  const textStyles = {
    green: "text-green-700",
    red: "text-red-700",
    gray: "text-gray-900",
  };
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${styles[color]}`}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${textStyles[color]}`}>{value}</p>
    </div>
  );
}