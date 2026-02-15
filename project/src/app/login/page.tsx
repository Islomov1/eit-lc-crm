"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Login failed");
        return;
      }

      const role = data?.user?.role;
      if (role === "ADMIN") router.push("/admin");
      else if (role === "TEACHER") router.push("/teacher");
      else if (role === "SUPPORT") router.push("/support");
      else setError("Unknown role");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="min-h-screen relative bg-linear-to-br from-white via-sky-50 to-sky-200">
      {/* soft background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="absolute top-24 -right-24 h-96 w-96 rounded-full bg-blue-300/25 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-112 w-md rounded-full bg-sky-400/20 blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 h-16 w-full bg-white/40 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl h-full px-4 flex items-center">
          {/* left logo */}
          <Image
            src="/logo.png"
            alt="EIT"
            width={180}
            height={60}
            priority
            quality={100}
          />

          {/* centered title */}
          <div className="flex-1 text-center">
            <h1 className="text-sm sm:text-base font-semibold tracking-tight text-black">
              EIT LC CRM
            </h1>
          </div>

          {/* spacer */}
          <div className="width-120px" />
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex items-center justify-center px-4">
        <div className="w-full max-w-md mt-16">
          <div className="rounded-3xl bg-white/70 backdrop-blur-xl shadow-[0_40px_100px_-40px_rgba(0,0,0,0.35)] transition">
            <div className="p-8 sm:p-10">
              <p className="text-center text-sm text-slate-600">
                Sign in to continue
              </p>

              <div className="mt-8 space-y-5">
                {/* Email */}
                <div>
                  <label className="block text-sm text-slate-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-3 rounded-2xl border border-black/80 bg-white text-black placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-black/10 focus:border-black transition"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={onKeyDown}
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm text-slate-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="w-full px-4 py-3 pr-14 rounded-2xl border border-black/80 bg-white text-black placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-black/10 focus:border-black transition"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={onKeyDown}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-black/70 hover:text-black transition"
                    >
                      {showPassword ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-red-100 text-red-700 px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                {/* Button */}
                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full py-3 rounded-2xl bg-black text-white font-semibold hover:bg-black/85 active:scale-[0.99] transition disabled:opacity-60"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Logging in…
                    </span>
                  ) : (
                    "Login"
                  )}
                </button>

                <p className="text-center text-xs text-slate-500">
                  Internal use only
                </p>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-slate-600 mt-6">
            © {new Date().getFullYear()} EIT LC
          </p>
        </div>
      </main>
    </div>
  );
}
