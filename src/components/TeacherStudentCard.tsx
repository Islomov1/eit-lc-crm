"use client";

import { useState } from "react";

type Group = { id: string; name: string };
type Parent = { id: string; name: string; phone: string; telegramId: bigint | null };

interface Props {
  student: {
    id: string;
    name: string;
    groups: Group[];
    parents: Parent[];
    isPaid: boolean;
  };
  allGroups: Group[];
  updateStudent: (fd: FormData) => Promise<void>;
  removeFromGroup: (fd: FormData) => Promise<void>;
  addParent: (fd: FormData) => Promise<void>;
  removeParent: (fd: FormData) => Promise<void>;
}

export function TeacherStudentCard({
  student,
  allGroups,
  updateStudent,
  removeFromGroup,
  addParent,
  removeParent,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [addingParent, setAddingParent] = useState(false);
  const studentGroup = student.groups[0];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 flex items-center gap-4 flex-wrap">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: "#f3f4f6", color: "#6b7280" }}
        >
          {student.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900 text-base">{student.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {student.groups.map((g) => (
              <span
                key={g.id}
                style={{ background: "#ede9fe", color: "#6d28d9", padding: "2px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 600 }}
              >
                {g.name}
              </span>
            ))}
            <span
              style={{
                background: student.isPaid ? "#dcfce7" : "#fee2e2",
                color: student.isPaid ? "#166534" : "#991b1b",
                padding: "2px 10px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              {student.isPaid ? "✓ Paid" : "✗ Not paid"}
            </span>
          </div>
        </div>

        {/* Edit toggle */}
        <button
          type="button"
          onClick={() => { setEditing((v) => !v); setAddingParent(false); }}
          className="h-9 px-4 rounded-xl text-sm font-medium border transition shrink-0"
          style={
            editing
              ? { background: "#111827", color: "#fff", borderColor: "#111827" }
              : { background: "#fff", color: "#6b7280", borderColor: "#e5e7eb" }
          }
        >
          {editing ? "✕ Close" : "✎ Edit"}
        </button>
      </div>

      {/* Edit drawer */}
      {editing && (
        <div className="px-6 py-4 border-t border-dashed border-gray-200 bg-gray-50/60 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Edit Student</p>

          {/* Name + group */}
          <form
            action={async (fd) => { await updateStudent(fd); setEditing(false); }}
            className="flex gap-2 flex-wrap items-center"
          >
            <input type="hidden" name="id" value={student.id} />
            <input type="hidden" name="oldGroupId" value={studentGroup?.id ?? ""} />
            <input
              name="name"
              defaultValue={student.name}
              autoFocus
              className="h-10 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[160px] flex-1"
            />
            <select
              name="newGroupId"
              defaultValue={studentGroup?.id ?? ""}
              className="h-10 border border-gray-200 rounded-xl px-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 w-48"
            >
              {allGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className="h-10 px-5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition"
            >
              Save
            </button>
          </form>

          {/* Remove from group */}
          {studentGroup && (
            <form action={removeFromGroup}>
              <input type="hidden" name="studentId" value={student.id} />
              <input type="hidden" name="groupId" value={studentGroup.id} />
              <button
                type="submit"
                className="text-xs font-semibold text-red-400 hover:text-red-600 transition"
              >
                Remove from {studentGroup.name}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Parents */}
      {student.parents.length > 0 && (
        <div className="border-t border-gray-100">
          {student.parents.map((parent) => (
            <div
              key={parent.id}
              className="flex items-center justify-between gap-3 px-6 py-3 border-b border-gray-50 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: "#f3f4f6", color: "#6b7280" }}
                >
                  {parent.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{parent.name}</p>
                  <p className="text-xs text-gray-400">{parent.phone}</p>
                </div>
                <span
                  style={{
                    background: parent.telegramId ? "#dcfce7" : "#f3f4f6",
                    color: parent.telegramId ? "#166534" : "#9ca3af",
                    padding: "1px 8px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  {parent.telegramId ? "✓ TG" : "No TG"}
                </span>
              </div>
              <form action={removeParent}>
                <input type="hidden" name="id" value={parent.id} />
                <button className="text-xs text-red-400 hover:text-red-600 transition font-medium">
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Add parent */}
      <div className="px-6 py-3 border-t border-gray-100">
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
            action={async (fd) => { await addParent(fd); setAddingParent(false); }}
            className="flex gap-2 flex-wrap items-center"
          >
            <input type="hidden" name="studentId" value={student.id} />
            <input
              name="name"
              placeholder="Parent name"
              required
              autoFocus
              className="h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[140px] flex-1"
            />
            <input
              name="phone"
              placeholder="+998..."
              required
              className="h-9 border border-gray-200 rounded-xl px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[140px] flex-1"
            />
            <button className="h-9 px-4 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition">
              Add
            </button>
            <button
              type="button"
              onClick={() => setAddingParent(false)}
              className="h-9 px-3 text-sm text-gray-400 hover:text-gray-600 transition"
            >
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}