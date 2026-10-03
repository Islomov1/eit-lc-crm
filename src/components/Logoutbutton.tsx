"use client";
import { useState } from "react";
export default function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      className="px-4 py-2 rounded-lg"
      onClick={async () => {
        setPending(true);
        setError(false);
        try {
          const r = await fetch("/api/logout", {
            method: "POST",
            cache: "no-store",
          });
          if (!r.ok) throw new Error();
          window.location.assign("/login");
        } catch {
          setPending(false);
          setError(true);
        }
      }}
    >
      {pending
        ? "Выходим…"
        : error
          ? "Ошибка. Повторить выход"
          : "Выйти из аккаунта"}
    </button>
  );
}
