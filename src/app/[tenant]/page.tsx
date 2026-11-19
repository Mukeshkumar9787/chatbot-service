"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";
import { getTenantFromUrl, buildTenantPath } from "@/lib/tenantUrl";

interface TenantHomePageProps {
  params: Promise<{ tenant: string }> | { tenant: string };
}

export default function TenantHomePage({ params }: TenantHomePageProps) {
  const router = useRouter();
  const [tenant, setTenant] = useState<string>("smk_tenant");
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [statusLoaded, setStatusLoaded] = useState<boolean>(false);
  const [isTenantActive, setIsTenantActive] = useState<boolean>(true);
  const [branding, setBranding] = useState<{
    storeName: string;
    primaryColor: string;
    accentColor: string;
    assistantName: string;
    logoUrl?: string | null;
  }>({
    storeName: "",
    primaryColor: "#3C50E0",
    accentColor: "#0EA5E9",
    assistantName: "Assistant",
    logoUrl: null,
  });

  useEffect(() => {
    let resolvedTenant = "smk_tenant";
    if (params && typeof (params as any).then === "function") {
      (params as Promise<{ tenant: string }>).then((p) => {
        if (p?.tenant) {
          resolvedTenant = p.tenant;
          setTenant(p.tenant);
          loadTenant(p.tenant);
        }
      });
    } else if ((params as any)?.tenant) {
      resolvedTenant = (params as any).tenant;
      setTenant(resolvedTenant);
      loadTenant(resolvedTenant);
    } else {
      resolvedTenant = getTenantFromUrl("smk_tenant");
      setTenant(resolvedTenant);
      loadTenant(resolvedTenant);
    }
  }, [params]);

  const loadTenant = async (tenantSlug: string) => {
    try {
      // 1. Check Store/Chatbot Active status
      const statusRes = await fetch(`/api/${encodeURIComponent(tenantSlug)}/status`);
      if (statusRes.status === 404) {
        setIsTenantActive(false);
        setStatusLoaded(true);
        return;
      }
      const statusData = await statusRes.json().catch(() => ({}));
      if (
        statusData &&
        (statusData.active === false || statusData.status === "INACTIVE" || statusData.error)
      ) {
        setIsTenantActive(false);
        setStatusLoaded(true);
        return;
      }

      setIsTenantActive(true);
      if (statusData && statusData.branding) {
        setBranding({
          storeName: statusData.branding.storeName || statusData.name || tenantSlug,
          primaryColor: statusData.branding.primaryColor || "#3C50E0",
          accentColor: statusData.branding.accentColor || "#0EA5E9",
          assistantName:
            statusData.branding.assistantName ||
            (statusData.branding.storeName ? `${statusData.branding.storeName} Assistant` : "Assistant"),
          logoUrl: statusData.branding.logoUrl || null,
        });
      }
      setStatusLoaded(true);
    } catch {
      setStatusLoaded(true);
    }

    // 2. Check Auth session
    const token = localStorage.getItem("rag_token") || localStorage.getItem("token");
    if (!token) {
      router.push(buildTenantPath("/admin/login", tenantSlug));
      return;
    }

    try {
      const authRes = await fetch(`/api/${encodeURIComponent(tenantSlug)}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (authRes.status === 401 || authRes.status === 403) {
        localStorage.removeItem("rag_token");
        localStorage.removeItem("token");
        localStorage.removeItem("rag_user");
        router.push(buildTenantPath("/admin/login", tenantSlug));
      } else {
        setAuthorized(true);
      }
    } catch {
      setAuthorized(true);
    }
  };

  // 404 Screen if store or chatbot is inactive
  if (statusLoaded && !isTenantActive) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 text-2xl font-bold mb-4">
            404
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">Store or Chatbot Inactive</h2>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            The store or chatbot assistant for <strong className="text-slate-700">{tenant}</strong> is
            currently inactive or not found.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition"
            >
              ← Back to Portal Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: branding.primaryColor, borderTopColor: "transparent" }}
          />
          <p className="text-xs font-medium text-slate-500">
            Loading {branding.storeName || tenant} portal...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-slate-50 font-sans">
      <AdminSidebar />

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-12">
          {/* Tenant Store Header */}
          <div className="text-center">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.storeName}
                className="mx-auto h-16 w-16 rounded-2xl object-contain shadow-sm border border-slate-100 mb-3 bg-white"
              />
            ) : (
              <div
                className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-white font-extrabold text-2xl shadow-md border border-black/5"
                style={{ backgroundColor: branding.primaryColor }}
              >
                {(branding.storeName || tenant || "S").charAt(0).toUpperCase()}
              </div>
            )}

            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: branding.primaryColor }} />
              <span>{branding.storeName || tenant} Customer Support Hub</span>
            </div>

            <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              {branding.storeName || tenant} Knowledge & Chatbot
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-xs sm:text-sm text-slate-600 leading-relaxed">
              Manage store policies, documents, branding, and preview your AI chatbot assistant. The
              assistant answers customer questions using strictly verified store documentation.
            </p>
          </div>

          {/* Quick Action Navigation Grid */}
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* Card 1: Customer Chat Widget */}
            <Link
              href={buildTenantPath("/widget", tenant)}
              className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-500 hover:shadow-lg"
            >
              <div>
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl group-hover:scale-110 transition text-white shadow-sm"
                  style={{ backgroundColor: branding.primaryColor }}
                >
                  💬
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">Customer Chat Widget</h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  Open and test the live customer-facing AI widget with {branding.assistantName}&apos;s real-time
                  grounded answers.
                </p>
              </div>
              <span
                className="mt-6 text-xs font-bold group-hover:underline"
                style={{ color: branding.primaryColor }}
              >
                Launch Widget →
              </span>
            </Link>

            {/* Card 2: Document Hub */}
            <Link
              href={buildTenantPath("/admin/documents", tenant)}
              className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-500 hover:shadow-lg"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl group-hover:scale-110 transition">
                  📁
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">Document Hub</h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  Upload PDF, TXT, CSV, DOCX or Markdown files to populate {branding.storeName || tenant}
                  &apos;s isolated vector collection.
                </p>
              </div>
              <span className="mt-6 text-xs font-bold text-emerald-600 group-hover:underline">
                Manage Documents →
              </span>
            </Link>

            {/* Card 3: Branding & Theme */}
            <Link
              href={buildTenantPath("/admin/branding", tenant)}
              className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-purple-500 hover:shadow-lg"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-2xl group-hover:scale-110 transition">
                  🎨
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">Branding & Theme</h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  Customize assistant name, primary/accent color scheme, support email, and inspect the
                  live widget simulator.
                </p>
              </div>
              <span className="mt-6 text-xs font-bold text-purple-600 group-hover:underline">
                Customize Theme →
              </span>
            </Link>

            {/* Card 4: Search & Preview */}
            <Link
              href={buildTenantPath("/admin/playground", tenant)}
              className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-500 hover:shadow-lg"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl group-hover:scale-110 transition">
                  🔍
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">Search & Preview</h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  Test customer questions and preview answers generated with semantic citations from your
                  store policies.
                </p>
              </div>
              <span className="mt-6 text-xs font-bold text-indigo-600 group-hover:underline">
                Open Playground →
              </span>
            </Link>

            {/* Card 5: Support Team */}
            <Link
              href={buildTenantPath("/admin/team", tenant)}
              className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-amber-500 hover:shadow-lg"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl group-hover:scale-110 transition">
                  👥
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">Support Team</h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  Manage administrator accounts, invitations, and password security for {branding.storeName || tenant}.
                </p>
              </div>
              <span className="mt-6 text-xs font-bold text-amber-600 group-hover:underline">
                Manage Team →
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
