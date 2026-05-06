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
      if (!res.ok) { setError(data?.error || "Login failed"); return; }
      const role = data?.user?.role;
      if (role === "ADMIN") router.push("/admin");
      else if (role === "TEACHER") router.push("/teacher");
      else if (role === "SUPPORT") router.push("/support");
      else setError("Unknown role");
      if (role === "DIRECTOR") router.push("/admin");
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
    <div className="min-h-screen bg-white flex flex-col">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .fade-1 { animation: fadeUp 0.5s ease both 0.05s; opacity: 0; }
        .fade-2 { animation: fadeUp 0.5s ease both 0.15s; opacity: 0; }
        .fade-3 { animation: fadeUp 0.5s ease both 0.25s; opacity: 0; }
        .fade-4 { animation: fadeUp 0.5s ease both 0.35s; opacity: 0; }
        .fade-5 { animation: fadeUp 0.5s ease both 0.45s; opacity: 0; }

        .crm-input {
          width: 100%;
          height: 52px;
          background: #f8f9fb;
          border: 1.5px solid #e8eaee;
          border-radius: 14px;
          padding: 0 16px;
          font-size: 14px;
          color: #111;
          outline: none;
          transition: all 0.2s ease;
          font-family: 'DM Sans', sans-serif;
        }
        .crm-input::placeholder { color: #adb3bf; }
        .crm-input:focus {
          border-color: #173662;
          background: #fff;
          box-shadow: 0 0 0 4px rgba(23,54,98,0.07);
        }

        .crm-btn {
          width: 100%;
          height: 52px;
          background: #173662;
          border: none;
          border-radius: 14px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
          letter-spacing: 0.2px;
          font-family: 'DM Sans', sans-serif;
          position: relative;
          overflow: hidden;
        }
        .crm-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%);
        }
        .crm-btn:hover:not(:disabled) {
          background: #1e4a7a;
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(23,54,98,0.28);
        }
        .crm-btn:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
        .crm-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        .show-btn {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          font-size: 11px;
          font-weight: 700;
          color: #adb3bf;
          cursor: pointer;
          letter-spacing: 0.06em;
          transition: color 0.15s;
          font-family: 'DM Sans', sans-serif;
        }
        .show-btn:hover { color: #173662; }
      `}</style>

      {/* Top bar */}
      <header className="fade-1 w-full bg-white h-16 flex items-center px-8 justify-between"
        style={{ borderBottom: "1px solid rgba(23,54,98,0.07)" }}>
        <Image src="/logo.png" alt="EIT LC" width={160} height={54} priority quality={100} className="object-contain" />
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#1a2d4a", letterSpacing: "-0.01em" }}>EIT LC CRM</span>
        <div style={{ width: 160 }} />
      </header>

      {/* Main */}
      <main
        className="flex-1 flex flex-col items-center justify-center px-4 py-16 relative"
        style={{ background: "linear-gradient(160deg, #ffffff 0%, #f2f6fb 60%, #e8eef7 100%)" }}
      >
        {/* Decorative blobs */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-100px", right: "-100px", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(23,54,98,0.05) 0%, transparent 70%)" }} />
          <div style={{ position: "absolute", bottom: "-80px", left: "-80px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(184,150,46,0.05) 0%, transparent 70%)" }} />
        </div>

        {/* Card */}
        <div className="fade-2 relative z-10 w-full max-w-md">
          <div style={{
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(24px)",
            borderRadius: "28px",
            padding: "48px 44px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.02), 0 24px 64px rgba(23,54,98,0.1), 0 0 0 1px rgba(23,54,98,0.05)",
          }}>

            <div className="fade-3 text-center mb-8">
              <p style={{ fontSize: "15px", color: "#6b7280" }}>Sign in to continue</p>
            </div>

            <div className="space-y-5">

              {/* Email */}
              <div className="fade-3">
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
                  Email
                </label>
                <input
                  type="email"
                  className="crm-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={onKeyDown}
                />
              </div>

              {/* Password */}
              <div className="fade-4">
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="crm-input"
                    style={{ paddingRight: "60px" }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={onKeyDown}
                  />
                  <button type="button" className="show-btn" onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? "HIDE" : "SHOW"}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "12px", padding: "12px 16px", fontSize: "13px", color: "#dc2626" }}>
                  {error}
                </div>
              )}

              {/* Button */}
              <div className="fade-5" style={{ paddingTop: "4px" }}>
                <button className="crm-btn" onClick={handleLogin} disabled={loading}>
                  {loading ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                      Logging in…
                    </span>
                  ) : "Login"}
                </button>
              </div>

              <p className="fade-5 text-center" style={{ fontSize: "12px", color: "#9ca3af", paddingTop: "2px" }}>
                Internal use only
              </p>
            </div>
          </div>
        </div>

        <p className="fade-5 relative z-10 text-center text-xs mt-6" style={{ color: "#9ca3af" }}>
          © {new Date().getFullYear()} EIT LC
        </p>
      </main>
    </div>
  );
}