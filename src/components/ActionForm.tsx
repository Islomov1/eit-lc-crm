"use client";
import { useActionState, type ReactNode } from "react";
export function ActionForm({
  action,
  children,
  className = "",
  id,
}: {
  action: (data: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const [state, dispatch, pending] = useActionState<
    { error?: string; ok?: boolean },
    FormData
  >(async (_: { error?: string; ok?: boolean }, data: FormData) => {
    try {
      await action(data);
      return { ok: true };
    } catch (e) {
      if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
      return {
        error:
          e instanceof Error &&
          /[А-Яа-яЁё]/.test(e.message) &&
          !/Prisma|prisma|SELECT|INSERT|UPDATE/.test(e.message)
            ? e.message
            : "Не удалось сохранить. Проверьте поля или обновите страницу.",
      };
    }
  }, {});
  return (
    <form action={dispatch} id={id} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      <div className="form-feedback" aria-live="polite">
        {pending ? (
          "Сохраняем…"
        ) : state.error ? (
          <span role="alert" className="error-text">
            {state.error}
          </span>
        ) : state.ok ? (
          <span className="success-text">Сохранено</span>
        ) : null}
      </div>
    </form>
  );
}
