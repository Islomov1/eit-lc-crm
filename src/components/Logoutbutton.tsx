"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onLogout = async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
        cache: "no-store",
      });
    } finally {
      startTransition(() => {
        router.replace("/login");
        router.refresh();
      });
    }
  };

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={pending}
      className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-85 disabled:opacity-60"
    >
      {pending ? "Logging out..." : "Log out"}
    </button>
  );
}