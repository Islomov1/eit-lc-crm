"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function RefreshReports() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn secondary"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
    >
      {pending ? "Обновляем…" : "Обновить статусы"}
    </button>
  );
}
