"use client";

import { useState } from "react";

export default function CreateParentInviteButton({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  const createAndCopy = async () => {
    setError(null);
    setLastLink(null);

    if (!botUsername) {
      setError("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is missing");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/ui/create-parent-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_UI_SECRET || "",
          // ВАЖНО: браузер не должен знать ADMIN_API_SECRET.
          // Поэтому этот endpoint нельзя напрямую дергать с клиента.
          // Решение ниже в Шаге 3.
        },
        body: JSON.stringify({ studentId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to create invite");
        return;
      }

      const code: string = data.code;
      const link = `https://t.me/${botUsername}?start=${code}`;

      await navigator.clipboard.writeText(link);
      setLastLink(link);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={createAndCopy}
        disabled={loading}
        className="px-3 py-2 rounded-xl bg-black text-white text-sm font-semibold hover:bg-black/85 disabled:opacity-60"
      >
        {loading ? "Creating…" : "Copy Telegram link"}
      </button>

      {lastLink && (
        <span className="text-xs text-slate-600 break-all">
          Copied ✅
        </span>
      )}

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
