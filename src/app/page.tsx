"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/AdminSidebar";

export default function HomePage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("rag_token") || localStorage.getItem("token");
    if (!token) {
      router.push("/admin/login");
      return;
    }

    const targetTenant = localStorage.getItem("selected_tenant") || "tenant_smk_default";
    // Verify token validity against server
    fetch(`/api/${encodeURIComponent(targetTenant)}/auth/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem("rag_token");
          localStorage.removeItem("token");
          localStorage.removeItem("rag_user");
          router.push("/admin/login");
        } else {
          setAuthorized(true);
        }
      })
      .catch(() => {
        setAuthorized(true);
      });
  }, [router]);

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
          <p className="text-xs font-medium text-slate-500">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-slate-50">
      <AdminSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3.5 py-1 text-xs font-semibold text-sky-800">
              <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
              Powered by Verified Store Documentation & AI
            </span>
            <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              SMK Customer Support & Knowledge Hub
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600">
              Upload store policies, product catalogs, and guides. The assistant answers customer inquiries directly using verified store knowledge.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Customer Chat Widget */}
            <Link
              href="/widget"
              className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-500 hover:shadow-lg"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-2xl group-hover:scale-110 transition">
                  💬
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">Chat Widget</h3>
                <p className="mt-2 text-xs text-slate-500">
                  Customer-facing AI chat assistant with direct grounded responses and suggested starter prompts.
                </p>
              </div>
              <span className="mt-6 text-xs font-semibold text-sky-600 group-hover:underline">
                Launch Widget →
              </span>
            </Link>

            {/* Card 2: Document Management */}
            <Link
              href="/admin/documents"
              className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-500 hover:shadow-lg"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl group-hover:scale-110 transition">
                  📁
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">Document Hub</h3>
                <p className="mt-2 text-xs text-slate-500">
                  Upload PDF, DOCX, TXT, CSV, or Markdown store policies and product manuals.
                </p>
              </div>
              <span className="mt-6 text-xs font-semibold text-emerald-600 group-hover:underline">
                Manage Documents →
              </span>
            </Link>

            {/* Card 3: Search & Preview */}
            <Link
              href="/admin/playground"
              className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-500 hover:shadow-lg"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl group-hover:scale-110 transition">
                  🔍
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">Search & Preview</h3>
                <p className="mt-2 text-xs text-slate-500">
                  Test customer questions and preview how answers are generated from store policies.
                </p>
              </div>
              <span className="mt-6 text-xs font-semibold text-indigo-600 group-hover:underline">
                Open Preview →
              </span>
            </Link>

            {/* Card 4: Support Team */}
            <Link
              href="/admin/team"
              className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-500 hover:shadow-lg"
            >
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-2xl group-hover:scale-110 transition">
                  👥
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">Support Team</h3>
                <p className="mt-2 text-xs text-slate-500">
                  Create and manage standalone knowledge base Support Admins and Operators.
                </p>
              </div>
              <span className="mt-6 text-xs font-semibold text-purple-600 group-hover:underline">
                Manage Team →
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

