"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function PlatformAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("mukeshkumar87086@gmail.com");
  const [password, setPassword] = useState("Mukesh@Platform2026!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/support/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success && data.token) {
        localStorage.setItem("chatbot_support_token", data.token);
        localStorage.setItem("rag_token", data.token);
        if (data.user) {
          localStorage.setItem("chatbot_support_user", JSON.stringify(data.user));
          localStorage.setItem("rag_user", JSON.stringify(data.user));
        }
        router.push("/platform/admin");
      } else {
        setError(data.error || "Invalid platform administrator credentials.");
      }
    } catch (err: any) {
      setError("Network or server error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/80 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-600 text-xl font-bold text-white shadow-lg shadow-sky-600/30">
            🏢
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Platform Administration
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Sign in with platform administrator credentials to manage all stores and chatbots.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-400">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Platform Admin Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mukeshkumar87086@gmail.com"
              className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 text-[11px] text-slate-400">
            <span className="font-semibold text-sky-400">Default Platform Credentials:</span>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-1 font-mono text-[10px]">
              <span>mukeshkumar87086@gmail.com</span>
              <span className="text-slate-500">Mukesh@Platform2026!</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-sky-600 py-3 text-xs font-bold text-white shadow-lg shadow-sky-600/30 transition hover:bg-sky-500 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In to Platform Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
