import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  status?: string; // all | linked | unlinked
}>;

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tashkent",
  }).format(d);
}

function badgeClass(status: "LINKED" | "NOT_LINKED") {
  return status === "LINKED"
    ? "bg-green-100 text-green-700 border-green-200"
    : "bg-gray-100 text-gray-700 border-gray-200";
}

function deliveryBadgeClass(status: string | null) {
  switch (status) {
    case "SENT":
      return "bg-green-100 text-green-700 border-green-200";
    case "FAILED":
      return "bg-red-100 text-red-700 border-red-200";
    case "PENDING":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

export default async function TelegramStatusPage(props: {
  searchParams: SearchParams;
}) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  if (!userId) redirect("/login");

  const admin = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!admin) redirect("/login");
  if (admin.role !== "ADMIN") redirect(`/${admin.role.toLowerCase()}`);

  const searchParams = await props.searchParams;
  const q = (searchParams.q ?? "").trim();
  const statusFilter = (searchParams.status ?? "all").toLowerCase();

  const parents = await prisma.parent.findMany({
    include: {
      student: {
        select: {
          id: true,
          name: true,
          group: {
            select: { name: true },
          },
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
    orderBy: [{ createdAt: "desc" }],
  });

  const rows = parents
    .map((p) => {
      const lastDelivery = p.telegramDeliveries[0] ?? null;
      const isLinked = p.telegramId !== null;

      return {
        id: p.id,
        parentName: p.name,
        phone: p.phone,
        telegramId: p.telegramId ? p.telegramId.toString() : null,
        linkStatus: isLinked ? "LINKED" as const : "NOT_LINKED" as const,
        studentName: p.student.name,
        groupName: p.student.group?.name ?? "—",
        lastDeliveryStatus: lastDelivery?.status ?? null,
        lastDeliveryCreatedAt: lastDelivery?.createdAt ?? null,
        lastAttemptAt: lastDelivery?.lastAttemptAt ?? null,
        sentAt: lastDelivery?.sentAt ?? null,
        lastError: lastDelivery?.error ?? null,
      };
    })
    .filter((row) => {
      if (statusFilter === "linked" && row.linkStatus !== "LINKED") return false;
      if (statusFilter === "unlinked" && row.linkStatus !== "NOT_LINKED") return false;

      if (!q) return true;
      const haystack = [
        row.parentName,
        row.phone,
        row.studentName,
        row.groupName,
        row.telegramId ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q.toLowerCase());
    });

  const stats = {
    total: rows.length,
    linked: rows.filter((r) => r.linkStatus === "LINKED").length,
    unlinked: rows.filter((r) => r.linkStatus === "NOT_LINKED").length,
    failed: rows.filter((r) => r.lastDeliveryStatus === "FAILED").length,
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-bold">Telegram Link Status</h1>
        <p className="text-sm text-slate-500 mt-1">
          Привязка родителей и последние статусы доставки Telegram
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-sm text-slate-500">Всего родителей</div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-sm text-slate-500">Привязаны</div>
          <div className="text-2xl font-bold mt-1">{stats.linked}</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-sm text-slate-500">Не привязаны</div>
          <div className="text-2xl font-bold mt-1">{stats.unlinked}</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-sm text-slate-500">Последняя доставка FAILED</div>
          <div className="text-2xl font-bold mt-1">{stats.failed}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-4 md:p-6">
        <form className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Поиск: родитель / ученик / телефон / группа"
            className="border rounded-xl px-3 py-2"
          />

          <select
            name="status"
            defaultValue={statusFilter}
            className="border rounded-xl px-3 py-2 bg-white"
          >
            <option value="all">Все</option>
            <option value="linked">Только привязанные</option>
            <option value="unlinked">Только не привязанные</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-black text-white px-4 py-2 hover:opacity-85"
          >
            Применить
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow p-4 md:p-6">
        <h2 className="font-semibold mb-4">Родители</h2>

        {rows.length === 0 ? (
          <p className="text-slate-500">Ничего не найдено.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="pb-2 pr-4">Родитель</th>
                  <th className="pb-2 pr-4">Телефон</th>
                  <th className="pb-2 pr-4">Ученик</th>
                  <th className="pb-2 pr-4">Группа</th>
                  <th className="pb-2 pr-4">Привязка</th>
                  <th className="pb-2 pr-4">Telegram ID</th>
                  <th className="pb-2 pr-4">Последняя доставка</th>
                  <th className="pb-2 pr-4">Когда</th>
                  <th className="pb-2">Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b align-top">
                    <td className="py-3 pr-4 font-medium">{row.parentName}</td>
                    <td className="py-3 pr-4">{row.phone}</td>
                    <td className="py-3 pr-4">{row.studentName}</td>
                    <td className="py-3 pr-4">{row.groupName}</td>

                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-medium ${badgeClass(
                          row.linkStatus
                        )}`}
                      >
                        {row.linkStatus === "LINKED" ? "Linked" : "Not linked"}
                      </span>
                    </td>

                    <td className="py-3 pr-4 text-slate-700">
                      {row.telegramId ?? "—"}
                    </td>

                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-medium ${deliveryBadgeClass(
                          row.lastDeliveryStatus
                        )}`}
                      >
                        {row.lastDeliveryStatus ?? "—"}
                      </span>
                    </td>

                    <td className="py-3 pr-4 text-slate-600">
                      {fmtDate(row.sentAt ?? row.lastAttemptAt ?? row.lastDeliveryCreatedAt)}
                    </td>

                    <td className="py-3 text-slate-600 max-w-[320px] whitespace-pre-wrap break-words">
                      {row.lastError ?? "—"}
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