"use client";

import { useState, useRef, useEffect } from "react";

type Group = { id: string; name: string };

interface GroupPickerProps {
  allGroups: Group[];
  selectedIds?: string[];
  name?: string;
}

export function GroupPicker({ allGroups, selectedIds = [], name = "groupIds" }: GroupPickerProps) {
  const [selected, setSelected] = useState<Array<Group>>(
    allGroups.filter((g) => selectedIds.includes(g.id))
  );
  const [open, setOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const available: Array<Group> = allGroups.filter(
    (g) =>
      !selected.some((s) => s.id === g.id) &&
      g.name.toLowerCase().includes(search.toLowerCase())
  );

  function addGroup(group: Group) {
    setSelected((prev) => [...prev, group]);
    setSearch("");
  }

  function removeGroup(id: string) {
    setSelected((prev) => prev.filter((g) => g.id !== id));
  }

  return (
    <div className="space-y-2">
      {selected.map((g) => (
        <input key={g.id} type="hidden" name={name} value={g.id} />
      ))}

      {/* Selected tags */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {selected.length === 0 && (
          <span className="text-xs text-gray-400 self-center">No groups assigned</span>
        )}
        {selected.map((g) => (
          <span
            key={g.id}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium"
          >
            {g.name}
            <button
              type="button"
              onClick={() => removeGroup(g.id)}
              className="ml-0.5 text-blue-400 hover:text-blue-700 transition leading-none"
            >
              &times;
            </button>
          </span>
        ))}
      </div>

      {/* Dropdown */}
      <div ref={ref} className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-8 px-3 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition flex items-center gap-1"
        >
          <span className="text-base leading-none">+</span>
          Add group
        </button>

        {open && (
          <div
            className="absolute left-0 mt-1 z-[999] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
            style={{ width: "220px" }}
          >
            {/* Search inside dropdown */}
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search group..."
                className="w-full h-8 px-3 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* Scrollable list */}
            <div className="overflow-y-auto" style={{ maxHeight: "200px" }}>
              {available.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400 text-center">
                  {search ? "No match" : "All groups added"}
                </p>
              ) : (
                available.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => addGroup(g)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition"
                  >
                    {g.name}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}