"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SupportLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // If already logged in as support, redirect to /support
    if (typeof window !== "undefined") {
      const existingToken = localStorage.getItem("chatbot_support_token");
      if (existingToken) {
        router.push("/support");
      }
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
        if (data.user) {
          localStorage.setItem("chatbot_support_user", JSON.stringify(data.user));
        }
        router.push("/support");
      } else {
        setError(data.error || "Invalid support credentials.");
      }
    } catch (err: any) {
      setError("Login failed: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-800/90 p-8 shadow-2xl backdrop-blur-md">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-white">
            Support Platform Admin
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Manage multi-tenant chatbot instances, sync status & embed links.
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300">Support Email</label>
            <input
              type="email"
              required
              placeholder="support@smk.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In to Platform Support"}
          </button>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-center text-xs font-medium text-rose-400">
              {error}
            </div>
          )}

          <div className="rounded-xl bg-slate-900/40 p-3 text-center text-[11px] text-slate-400">
            Default platform credentials: <code className="text-indigo-300">support@smk.com</code> / <code className="text-indigo-300">Admin@123456</code>
          </div>
        </form>
      </div>
    </div>
  );
}
