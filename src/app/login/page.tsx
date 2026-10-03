"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="login-page">
      <section className="login-brand">
        <div className="brand">
          <Image
            src="/brand/eit-logo-white.svg"
            width={6479}
            height={1440}
            alt="EIT — Excellence in Teaching"
            priority
          />
          <small>OPERATING SYSTEM</small>
        </div>
        <div>
          <div className="eyebrow" style={{ color: "var(--lime)" }}>
            ЛЮДИ. ОБУЧЕНИЕ. РЕЗУЛЬТАТ.
          </div>
          <h1>
            Всё важное.
            <br />
            <em>В одном месте.</em>
          </h1>
          <p>
            Ученики, команда и ежедневная работа учебного центра — в EIT OS.
          </p>
        </div>
        <small>EIT Learning Centre</small>
      </section>
      <section className="login-form">
        <div>
          <div className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</div>
          <h1>Войти в CRM</h1>
          <p className="muted">Используйте рабочий аккаунт EIT.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                const r = await fetch("/api/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email: f.get("email"),
                    password: f.get("password"),
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                const role = d.user.role;
                router.push(
                  role === "DIRECTOR" || role === "ADMIN"
                    ? "/admin"
                    : role === "TEACHER"
                      ? "/teacher"
                      : "/support",
                );
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Ошибка соединения");
                setPending(false);
              }
            }}
          >
            <label className="field">
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="name@eitlc.uz"
              />
            </label>
            <label className="field">
              <span>Пароль</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className="btn" disabled={pending}>
              {pending ? "Входим…" : "Войти →"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
