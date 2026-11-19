"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import TurnstileWidget, { TurnstileRef } from "@/components/TurnstileWidget";
import { getTenantFromUrl, buildTenantPath } from "@/lib/tenantUrl";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<string>("smk_tenant");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number>(0);
  const turnstileRef = useRef<TurnstileRef>(null);

  const [tenantStatus, setTenantStatus] = useState<{
    loaded: boolean;
    active: boolean;
    name: string;
    storeName: string;
    primaryColor: string;
    accentColor: string;
    logoUrl?: string | null;
  }>({
    loaded: false,
    active: true,
    name: "SMK Store",
    storeName: "SMK Store",
    primaryColor: "#3C50E0",
    accentColor: "#0EA5E9",
    logoUrl: null,
  });

  // Determine tenant from URL path or query param, defaulting to smk_tenant
  useEffect(() => {
    const tenant = getTenantFromUrl("smk_tenant");
    setSelectedTenant(tenant);

    fetch(`/api/${encodeURIComponent(tenant)}/status`)
      .then((res) => {
        if (res.status === 404) {
          setTenantStatus({
            loaded: true,
            active: false,
            name: tenant,
            storeName: tenant,
            primaryColor: "#3C50E0",
            accentColor: "#0EA5E9",
            logoUrl: null,
          });
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const branding = data.branding || {};
        const storeName = branding.storeName || data.name || tenant;
        setTenantStatus({
          loaded: true,
          active: data.active !== false && data.status !== "INACTIVE" && !data.error,
          name: data.name || storeName,
          storeName,
          primaryColor: branding.primaryColor || "#3C50E0",
          accentColor: branding.accentColor || "#0EA5E9",
          logoUrl: branding.logoUrl || null,
        });
      })
      .catch(() => {
        setTenantStatus((prev) => ({ ...prev, loaded: true }));
      });
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

    // Actively generate/retrieve Cloudflare Turnstile token on submit
    let token = turnstileToken;
    if (turnstileRef.current) {
      const retrieved = await turnstileRef.current.getToken();
      if (retrieved) {
        token = retrieved;
        setTurnstileToken(retrieved);
      }
    }

    const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY;
    if (siteKey && !token) {
      setError("Please complete the Cloudflare security verification before signing in.");
      return;
    }

    setLoading(true);

    try {
      const targetTenant = selectedTenant?.trim() || "tenant_smk_default";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["x-turnstile-token"] = token;
        headers["cf-turnstile-token"] = token;
      }

      const res = await fetch(`/api/${encodeURIComponent(targetTenant)}/auth/login`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email,
          password,
          turnstileToken: token,
          "cf-turnstile-response": token,
        }),
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
        localStorage.setItem("selected_tenant", data.tenantSlug || targetTenant);
        localStorage.setItem("rag_tenant", data.tenant_id || targetTenant);
        if (data.user) {
          localStorage.setItem("rag_user", JSON.stringify(data.user));
        }
        router.push(buildTenantPath("/admin/documents", targetTenant));
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

  if (tenantStatus.loaded && !tenantStatus.active) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-slate-50 font-sans text-slate-800">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl animate-fadeIn">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-3xl shadow-inner">
            🔍
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">404</h1>
          <h2 className="mt-2 text-lg font-bold text-slate-700">Store or Admin Portal Not Found</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            The requested store or AI chatbot assistant is currently inactive, disabled, or does not exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-slate-50">
      <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl overflow-hidden">
        {/* Dynamic tenant brand accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5"
          style={{ backgroundColor: tenantStatus.primaryColor }}
        />

        <div className="text-center">
          {tenantStatus.logoUrl ? (
            <img
              src={tenantStatus.logoUrl}
              alt={tenantStatus.storeName}
              className="mx-auto h-14 w-14 rounded-2xl object-contain shadow-sm border border-slate-100"
            />
          ) : (
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white font-extrabold text-2xl shadow-md border border-black/5"
              style={{ backgroundColor: tenantStatus.primaryColor }}
            >
              {(tenantStatus.storeName || "S").charAt(0).toUpperCase()}
            </div>
          )}

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: tenantStatus.primaryColor }}
            />
            <span>{tenantStatus.storeName}</span>
          </div>

          <h2 className="mt-2 text-2xl font-extrabold text-slate-900">
            {tenantStatus.storeName} Admin Login
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Sign in to manage {tenantStatus.storeName} store documents, branding, and customer support.
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
              className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": tenantStatus.primaryColor } as any}
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
              className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": tenantStatus.primaryColor } as any}
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
            style={{ backgroundColor: tenantStatus.primaryColor }}
            className="w-full rounded-2xl py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
          >
            {rateLimitCooldown > 0
              ? `Please wait ${rateLimitCooldown}s...`
              : loading
              ? "Signing in..."
              : `Sign In to ${tenantStatus.storeName}`}
          </button>

          {error && <p className="text-center text-xs font-medium text-rose-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}

