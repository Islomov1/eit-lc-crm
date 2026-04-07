import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { LeadStatus } from "@prisma/client";
import Link from "next/link";

export const revalidate = 30;

/* ================= SERVER ACTIONS ================= */

async function createLead(formData: FormData) {
  "use server";
  const name = formData.get("name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  const source = formData.get("source")?.toString();
  const program = formData.get("program")?.toString();
  const note = formData.get("note")?.toString().trim();
  if (!name) return;
  await prisma.lead.create({
    data: {
      name,
      phone: phone || null,
      source: source || "manual",
      program: program || null,
      note: note || null,
      status: "NEW",
    },
  });
  revalidatePath("/admin/leads");
}

async function updateLead(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const phone = formData.get("phone")?.toString().trim();
  const source = formData.get("source")?.toString();
  const program = formData.get("program")?.toString();
  const status = formData.get("status")?.toString() as LeadStatus;
  const note = formData.get("note")?.toString().trim();
  if (!id || !name) return;
  await prisma.lead.update({
    where: { id },
    data: {
      name,
      phone: phone || null,
      source: source || null,
      program: program || null,
      status,
      note: note || null,
    },
  });
  revalidatePath("/admin/leads");
}

async function deleteLead(formData: FormData) {
  "use server";
  const id = formData.get("id")?.toString();
  if (!id) return;
  await prisma.lead.delete({ where: { id } });
  revalidatePath("/admin/leads");
}

/* ================= HELPERS ================= */

const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700",
  FROZEN: "bg-gray-200 text-gray-600",
  CONVERTED: "bg-purple-100 text-purple-700",
  LOST: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  ACTIVE: "Active",
  FROZEN: "Frozen",
  CONVERTED: "Converted",
  LOST: "Lost",
};

const SOURCES = ["manual", "instagram", "telegram", "whatsapp", "referral", "website", "other"];
const PROGRAMS = ["IELTS", "SAT", "B2", "C1", "C2", "TOEFL", "CUSTOM"];
const STATUSES = ["NEW", "ACTIVE", "FROZEN", "CONVERTED", "LOST"] as LeadStatus[];

type SP = Record<string, string | string[] | undefined>;
function spStr(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

/* ================= PAGE ================= */

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  const q = spStr(sp.q).trim();
  const statusFilter = spStr(sp.status).trim() as LeadStatus | "";
  const sourceFilter = spStr(sp.source).trim();

  const [leads, counts] = await Promise.all([
    prisma.lead.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(sourceFilter ? { source: sourceFilter } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q, mode: "insensitive" } },
                { program: { contains: q, mode: "insensitive" } },
                { note: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.lead.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const total = Object.values(countMap).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-8 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total leads</p>
        </div>
      </div>

      {/* Status counters */}
      <div className="grid grid-cols-5 gap-3">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={statusFilter === s ? "/admin/leads" : `/admin/leads?status=${s}`}
            className={`rounded-2xl p-4 border text-center transition ${
              statusFilter === s
                ? "border-gray-900 bg-gray-900 text-white"
                : "bg-white border-gray-100 hover:border-gray-300"
            }`}
          >
            <p className={`text-2xl font-bold ${statusFilter === s ? "text-white" : "text-gray-900"}`}>
              {countMap[s] ?? 0}
            </p>
            <p className={`text-xs font-semibold mt-1 ${statusFilter === s ? "text-gray-300" : "text-gray-500"}`}>
              {STATUS_LABELS[s]}
            </p>
          </Link>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <form className="flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name / phone / program..."
            className="flex-1 h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[200px]"
          />
          <select name="status" defaultValue={statusFilter} className="h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select name="source" defaultValue={sourceFilter} className="h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">All sources</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="h-11 px-6 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
            Search
          </button>
          <Link href="/admin/leads" className="h-11 px-4 flex items-center border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">
            Reset
          </Link>
        </form>
      </div>

      {/* Create lead */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Add Lead Manually</h2>
        <form action={createLead} className="grid grid-cols-6 gap-3">
          <input name="name" placeholder="Full name" required className="col-span-2 h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <input name="phone" placeholder="Phone (+998...)" className="h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <select name="source" className="h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="program" className="h-11 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
            <option value="">No program</option>
            {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input name="note" placeholder="Note (optional)" className="col-span-5 h-11 border border-gray-200 rounded-xl px-4 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <button className="h-11 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
            Add Lead
          </button>
        </form>
      </div>

      {/* Leads table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900">
            {leads.length} lead{leads.length !== 1 ? "s" : ""}
            {statusFilter && <span className="ml-2 text-sm font-normal text-gray-400">· filtered by {STATUS_LABELS[statusFilter]}</span>}
          </p>
        </div>

        {leads.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-400">No leads found.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {leads.map((lead) => (
              <div key={lead.id} className="px-6 py-4 hover:bg-gray-50 transition">
                <form action={updateLead} className="grid grid-cols-12 gap-3 items-center">
                  <input type="hidden" name="id" value={lead.id} />

                  {/* Name */}
                  <div className="col-span-2">
                    <input
                      name="name"
                      defaultValue={lead.name}
                      className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  {/* Phone */}
                  <div className="col-span-2">
                    <input
                      name="phone"
                      defaultValue={lead.phone ?? ""}
                      placeholder="Phone"
                      className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  {/* Source */}
                  <div className="col-span-1">
                    <select name="source" defaultValue={lead.source ?? "manual"} className="w-full h-10 border border-gray-200 rounded-xl px-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                      {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Program */}
                  <div className="col-span-1">
                    <select name="program" defaultValue={lead.program ?? ""} className="w-full h-10 border border-gray-200 rounded-xl px-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                      <option value="">—</option>
                      {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  {/* Status */}
                  <div className="col-span-2">
                    <select name="status" defaultValue={lead.status} className="w-full h-10 border border-gray-200 rounded-xl px-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Note */}
                  <div className="col-span-2">
                    <input
                      name="note"
                      defaultValue={lead.note ?? ""}
                      placeholder="Note..."
                      className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  {/* Date + Actions */}
                  <div className="col-span-2 flex items-center gap-2 justify-end">
                    <span className="text-xs text-gray-400 hidden lg:block">{fmtDate(lead.createdAt)}</span>
                    <button type="submit" className="h-9 px-3 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition">
                      Save
                    </button>
                    <form action={deleteLead}>
                      <input type="hidden" name="id" value={lead.id} />
                      <button type="submit" className="h-9 px-3 rounded-xl bg-red-100 text-red-600 text-xs font-semibold hover:bg-red-200 transition">
                        Del
                      </button>
                    </form>
                  </div>

                </form>

                {/* Status badge display */}
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[lead.status]}`}>
                    {STATUS_LABELS[lead.status]}
                  </span>
                  {lead.source && (
                    <span className="text-xs text-gray-400">via {lead.source}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}