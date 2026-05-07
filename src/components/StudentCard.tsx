"use client";

import { useState } from "react";
import Link from "next/link";
import { GroupPicker } from "@/components/GroupPicker";

type Group = { id: string; name: string };
type Parent = {
  id: string;
  name: string;
  phone: string;
  telegramId: bigint | null;
};

interface StudentCardProps {
  student: {
    id: string;
    name: string;
    groups: Group[];
    parents: Parent[];
  };
  allGroups: Group[];
  updateStudent: (formData: FormData) => Promise<void>;
  deleteStudent: (formData: FormData) => Promise<void>;
  updateParent: (formData: FormData) => Promise<void>;
  deleteParent: (formData: FormData) => Promise<void>;
  createParent: (formData: FormData) => Promise<void>;
  createParentInvite: (formData: FormData) => Promise<void>;
}

const GROUP_PALETTE = [
  { bg: "#ede9fe", color: "#6d28d9" },
  { bg: "#e0f2fe", color: "#0369a1" },
  { bg: "#d1fae5", color: "#065f46" },
  { bg: "#fef3c7", color: "#92400e" },
  { bg: "#ffe4e6", color: "#9f1239" },
  { bg: "#e0e7ff", color: "#3730a3" },
];

function ParentRow({
  parent,
  updateParent,
  deleteParent,
}: {
  parent: Parent;
  updateParent: (fd: FormData) => Promise<void>;
  deleteParent: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-5 border-t border-gray-100 group">
      {!editing ? (
        <>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ background: "#f3f4f6", color: "#6b7280" }}
            >
              {parent.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">{parent.name}</p>
              <p className="text-xs text-gray-400">{parent.phone}</p>
            </div>
            <span
              className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold"
              style={
                parent.telegramId
                  ? { background: "#dcfce7", color: "#166534" }
                  : { background: "#f3f4f6", color: "#9ca3af" }
              }
            >
              {parent.telegramId ? "✓ Telegram" : "No Telegram"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium text-gray-400 hover:text-gray-700 px-2.5 py-1 rounded-lg hover:bg-gray-100 shrink-0"
          >
            Edit
          </button>
        </>
      ) : (
        <form
          action={async (fd) => { await updateParent(fd); setEditing(false); }}
          className="flex items-center gap-2 flex-wrap w-full"
        >
          <input type="hidden" name="id" value={parent.id} />
          <input
            name="name"
            defaultValue={parent.name}
            autoFocus
            className="h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 w-40"
          />
          <input
            name="phone"
            defaultValue={parent.phone}
            className="h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 w-36"
          />
          <div className="flex items-center gap-2 ml-auto">
            <button type="submit" className="h-9 px-4 bg-gray-900 text-white rounded-xl text-xs font-semibold hover:bg-gray-700 transition">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-9 px-3 text-xs text-gray-400 hover:text-gray-600">
              Cancel
            </button>
            <button type="submit" formAction={deleteParent} className="h-9 px-3 text-xs font-semibold text-red-400 hover:text-red-600">
              Remove
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function StudentCard({
  student,
  allGroups,
  updateStudent,
  deleteStudent,
  updateParent,
  deleteParent,
  createParent,
  createParentInvite,
}: StudentCardProps) {
  const [editing, setEditing] = useState(false);
  const [addingParent, setAddingParent] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* Header */}
        <div className="px-6 pt-6 pb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-4">
          <Link
            href={`/admin/students/${student.id}`}
            className="text-base font-bold text-gray-900 hover:text-blue-600 transition block"
          >
            {student.name}
          </Link>

          {/* Group tags — inline styles to avoid Tailwind purge */}
          <div className="flex flex-wrap gap-2">
            {student.groups.length === 0 ? (
              <span className="text-xs text-gray-300 italic">No groups</span>
            ) : (
              student.groups.map((g, i) => {
                const palette = GROUP_PALETTE[i % GROUP_PALETTE.length];
                return (
                  <span
                    key={g.id}
                    style={{
                      background: palette.bg,
                      color: palette.color,
                      padding: "3px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {g.name}
                  </span>
                );
              })
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => { setEditing((v) => !v); setAddingParent(false); }}
            className="h-9 px-4 rounded-xl text-sm font-medium border transition"
            style={
              editing
                ? { background: "#111827", color: "#fff", borderColor: "#111827" }
                : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
            }
          >
            {editing ? "✕ Close" : "✎ Edit"}
          </button>
          <form action={createParentInvite}>
            <input type="hidden" name="studentId" value={student.id} />
            <button className="h-9 px-4 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 transition font-medium">
              TG Link
            </button>
          </form>
          <form action={deleteStudent}>
            <input type="hidden" name="id" value={student.id} />
            <button
              className="h-9 px-4 rounded-xl text-sm font-semibold border transition"
              style={{ background: "#fff1f2", color: "#f43f5e", borderColor: "#fecdd3" }}
            >
              Delete
            </button>
          </form>
        </div>
      </div>

      {/* Edit drawer */}
      {editing && (
        <div className="border-t border-dashed border-gray-200 px-6 py-4 space-y-3" style={{ background: "#fafafa" }}>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Edit Student</p>
          <form action={async (fd) => { await updateStudent(fd); setEditing(false); }} className="space-y-3">
            <input type="hidden" name="id" value={student.id} />
            <div className="flex gap-2">
              <input
                name="name"
                defaultValue={student.name}
                autoFocus
                required
                className="flex-1 h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <button type="submit" className="h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
                Save
              </button>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Groups</p>
              <GroupPicker allGroups={allGroups} selectedIds={student.groups.map((g) => g.id)} />
            </div>
          </form>
        </div>
      )}

      {/* Parents */}
      {student.parents.map((parent) => (
        <ParentRow
          key={parent.id}
          parent={parent}
          updateParent={updateParent}
          deleteParent={deleteParent}
        />
      ))}

      {/* Add parent */}
      <div className="px-6 py-5 border-t border-gray-100">
        {!addingParent ? (
          <button
            type="button"
            onClick={() => setAddingParent(true)}
            className="text-sm text-gray-400 hover:text-gray-700 transition font-medium"
          >
            + Add parent
          </button>
        ) : (
          <form
            action={async (fd) => { await createParent(fd); setAddingParent(false); }}
            className="flex gap-2 flex-wrap items-center"
          >
            <input type="hidden" name="studentId" value={student.id} />
            <input name="name" placeholder="Parent name" required autoFocus className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[150px] flex-1" />
            <input name="phone" placeholder="+998..." required className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[150px] flex-1" />
            <button className="h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">Add</button>
            <button type="button" onClick={() => setAddingParent(false)} className="h-10 px-3 text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          </form>
        )}
      </div>
    </div>
  );
}