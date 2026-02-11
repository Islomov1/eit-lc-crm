"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Login failed");
      setLoading(false);
      return;
    }

    if (data.user.role === "ADMIN") {
      router.push("/admin");
    } else if (data.user.role === "TEACHER") {
      router.push("/teacher");
    } else if (data.user.role === "SUPPORT") {
      router.push("/support");
    }
  };

  return (
    
    <div className="min-h-screen flex items-center justify-center .bg-gradient-to-br from-gray-900 to-gray-700">

      <div className="w-full max-w-md bg-white/10 backdrop-blur-lg p-10 rounded-3xl shadow-2xl border border-white/20">
<div className="flex justify-center mb-4">
  <Image
    src="/logo.png"
    alt="EIT LC CRM"
    width={200}
    height={80}
  />
</div>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">
            EIT
          </h1>
          <p className="text-gray-300 text-sm mt-2">
            Log in
          </p>
        </div>

        <div className="space-y-5">

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Email
            </label>
            <input
              className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-gray-300 border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-gray-300 border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 text-sm p-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-white text-gray-900 font-semibold hover:opacity-90 active:scale-95 transition"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

        </div>

      </div>
    </div>
  );
}