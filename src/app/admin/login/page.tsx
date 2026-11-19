"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import TurnstileWidget, { TurnstileRef } from "@/components/TurnstileWidget";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number>(0);
  const turnstileRef = useRef<TurnstileRef>(null);



  // Determine tenant from URL path, query param or localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      // 1️⃣ Try to get tenant from the first path segment (e.g. /blipkart/...)
      const pathTenant = window.location.pathname.split('/')[1];
      if (pathTenant && !['admin', 'api', ''].includes(pathTenant)) {
        setSelectedTenant(pathTenant);
        return;
      }
      // 2️⃣ Fallback to query parameter ?tenant= or ?tenantId=
      const urlParams = new URLSearchParams(window.location.search);
      const tenantParam = urlParams.get("tenant") || urlParams.get("tenantId");
      if (tenantParam) {
        setSelectedTenant(tenantParam);
        return;
      }
      // 3️⃣ Finally use stored tenant from localStorage
      const savedTenant = localStorage.getItem("selected_tenant");
      if (savedTenant) setSelectedTenant(savedTenant);
    }
  }, []);



  useEffect(() => {
    if (rateLimitCooldown <= 0) return;
    const timer = setInterval(() => {
      setRateLimitCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCooldown]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Actively generate/retrieve Cloudflare Turnstile token on submit
      let token = turnstileToken;
      if (turnstileRef.current) {
        token = await turnstileRef.current.getToken();
        if (token) {
          setTurnstileToken(token);
        }
      }

      const targetTenant = selectedTenant?.trim() || "tenant_smk_default";
      const res = await fetch(`/api/${encodeURIComponent(targetTenant)}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken: token }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        turnstileRef.current?.reset();
        setTurnstileToken("");
        const retryAfter =
          data.retryAfterSeconds ||
          parseInt(res.headers.get("Retry-After") || "60", 10) ||
          60;
        setRateLimitCooldown(retryAfter);
        setError(
          data.error ||
            `Please wait ${retryAfter}s before trying again.`
        );
        return;
      }

      if (res.ok && data.success && data.token) {
        localStorage.setItem("rag_token", data.token);
        localStorage.setItem("selected_tenant", targetTenant);
        localStorage.setItem("rag_tenant", targetTenant);
        if (data.user) {
          localStorage.setItem("rag_user", JSON.stringify(data.user));
        }
        router.push("/admin/documents");
      } else {
        // Reset turnstile token and widget on invalid credentials so next try has a fresh token
        turnstileRef.current?.reset();
        setTurnstileToken("");
        setError(data.error || "Invalid credentials.");
      }
    } catch (err: any) {
      turnstileRef.current?.reset();
      setTurnstileToken("");
      setError("Login failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-slate-50">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="text-center">
          <img
            src="/images/logo/smk.jpg"
            alt="SMK Logo"
            className="mx-auto h-14 w-14 rounded-2xl object-contain shadow-sm border border-slate-100"
          />
          <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Knowledge Base Login</h2>
          <p className="mt-1 text-xs text-slate-500">
            Sign in to manage store documents and customer support settings.
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-6 space-y-4">


          <div>
            <label className="text-xs font-semibold text-slate-700">Email Address</label>
            <input
              type="email"
              required
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">Password</label>
            <input
              type="password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          <TurnstileWidget ref={turnstileRef} onVerify={(token) => setTurnstileToken(token)} />

          {rateLimitCooldown > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center text-xs text-amber-800">
              ⏳ Please wait <strong>{rateLimitCooldown}s</strong> before trying again.
            </div>
          )}

          <button
            type="submit"
            disabled={loading || rateLimitCooldown > 0}
            className="w-full rounded-2xl bg-sky-600 py-3 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rateLimitCooldown > 0
              ? `Please wait ${rateLimitCooldown}s...`
              : loading
              ? "Signing in..."
              : "Sign In to Admin"}
          </button>

          {error && <p className="text-center text-xs font-medium text-rose-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}

