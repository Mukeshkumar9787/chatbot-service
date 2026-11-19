"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE";
  source: "SMK_ECOMMERCE" | "STANDALONE";
  plan_code?: string;
  ai_chatbot_enabled: boolean;
  settings?: any;
  created_at: string;
  updated_at: string;
}

export default function SupportTenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "STANDALONE" | "SMK_ECOMMERCE">("ALL");
  const [user, setUser] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Theme state with localStorage persistence
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("chatbot_support_theme") as "dark" | "light" | null;
      if (savedTheme) {
        setTheme(savedTheme);
      }
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("chatbot_support_theme", nextTheme);
  };

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [embedModalTenant, setEmbedModalTenant] = useState<Tenant | null>(null);

  // New tenant form state
  const [newTenant, setNewTenant] = useState({
    name: "",
    slug: "",
    ownerEmail: "",
    ownerPassword: "",
    planCode: "STANDALONE_PRO",
    status: "ACTIVE" as "ACTIVE" | "INACTIVE",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const token = localStorage.getItem("chatbot_support_token");
      if (!token) {
        router.push("/support/login");
        return;
      }

      const res = await fetch("/api/support/tenants", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("chatbot_support_token");
        router.push("/support/login");
        return;
      }

      const data = await res.json();
      if (res.ok && data.success) {
        setTenants(data.tenants || []);
      } else {
        setErrorMsg(data.error || "Failed to load tenants");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error loading tenants");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const rawUser = localStorage.getItem("chatbot_support_user");
    if (rawUser) {
      try {
        setUser(JSON.parse(rawUser));
      } catch (e) {}
    }
    fetchTenants();
  }, [fetchTenants]);

  const handleLogout = () => {
    localStorage.removeItem("chatbot_support_token");
    localStorage.removeItem("chatbot_support_user");
    router.push("/support/login");
  };

  const handleToggleStatus = async (tenant: Tenant) => {
    const newStatus = tenant.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      setActionLoading(tenant.id);
      const token = localStorage.getItem("chatbot_support_token");
      const res = await fetch(`/api/support/tenants/${encodeURIComponent(tenant.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.tenant) {
        setTenants((prev) =>
          prev.map((t) => (t.id === tenant.id ? { ...t, ...data.tenant } : t))
        );
      } else {
        alert(data.error || "Failed to update tenant status.");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreateLoading(true);

    try {
      const token = localStorage.getItem("chatbot_support_token");
      const res = await fetch("/api/support/tenants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newTenant),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setIsCreateOpen(false);
        setNewTenant({
          name: "",
          slug: "",
          ownerEmail: "",
          ownerPassword: "",
          planCode: "STANDALONE_PRO",
          status: "ACTIVE",
        });
        await fetchTenants();
        if (data.tenant) {
          setEmbedModalTenant(data.tenant);
        }
      } else {
        setCreateError(data.error || "Failed to create tenant.");
      }
    } catch (err: any) {
      setCreateError("Error: " + err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(type);
    setTimeout(() => setCopiedSnippet(null), 2500);
  };

  // Base host for embed code
  const origin = typeof window !== "undefined" ? window.location.origin : "https://chatbot-service-three.vercel.app";

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase()) ||
        t.id.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" ? true : t.status === statusFilter;

      const matchesSource =
        sourceFilter === "ALL" ? true : t.source === sourceFilter;

      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [tenants, search, statusFilter, sourceFilter]);

  const metrics = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter((t) => t.status === "ACTIVE").length;
    const inactive = total - active;
    const standalone = tenants.filter((t) => t.source === "STANDALONE").length;
    const smk = total - standalone;
    return { total, active, inactive, standalone, smk };
  }, [tenants]);

  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen pb-16 transition-colors duration-200 ${
        isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Top Header */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors duration-200 ${
          isDark
            ? "border-slate-800 bg-slate-900/70"
            : "border-slate-200 bg-white/80 shadow-sm"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20">
              ⚡
            </div>
            <div>
              <h1
                className={`text-base font-extrabold tracking-tight ${
                  isDark ? "text-white" : "text-slate-900"
                }`}
              >
                Chatbot Service Support Admin
              </h1>
              <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Multi-Tenant Store Management & Cross-Platform Embedding
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                isDark
                  ? "border-slate-700 bg-slate-800 text-amber-300 hover:bg-slate-700 hover:text-amber-200"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 shadow-sm"
              }`}
              title={`Switch to ${isDark ? "Light" : "Dark"} mode`}
            >
              <span>{isDark ? "☀️" : "🌙"}</span>
              <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
            </button>

            {user && (
              <div className="text-right hidden sm:block">
                <div
                  className={`text-xs font-semibold ${
                    isDark ? "text-slate-200" : "text-slate-800"
                  }`}
                >
                  {user.name}
                </div>
                <div className="text-[10px] text-indigo-500 font-mono">{user.email}</div>
              </div>
            )}

            <button
              onClick={handleLogout}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                isDark
                  ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-sm"
              }`}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div
            className={`rounded-2xl border p-4 transition-colors ${
              isDark
                ? "border-slate-800 bg-slate-900/50"
                : "border-slate-200 bg-white shadow-sm"
            }`}
          >
            <span
              className={`text-[11px] font-medium ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}
            >
              Total Tenants
            </span>
            <div
              className={`mt-1 text-2xl font-black ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              {metrics.total}
            </div>
          </div>

          <div
            className={`rounded-2xl border p-4 transition-colors ${
              isDark
                ? "border-emerald-900/30 bg-emerald-950/20"
                : "border-emerald-200 bg-emerald-50/60 shadow-sm"
            }`}
          >
            <span
              className={`text-[11px] font-medium ${
                isDark ? "text-emerald-400" : "text-emerald-700"
              }`}
            >
              Active
            </span>
            <div
              className={`mt-1 text-2xl font-black ${
                isDark ? "text-emerald-300" : "text-emerald-600"
              }`}
            >
              {metrics.active}
            </div>
          </div>

          <div
            className={`rounded-2xl border p-4 transition-colors ${
              isDark
                ? "border-rose-900/30 bg-rose-950/20"
                : "border-rose-200 bg-rose-50/60 shadow-sm"
            }`}
          >
            <span
              className={`text-[11px] font-medium ${
                isDark ? "text-rose-400" : "text-rose-700"
              }`}
            >
              Inactive / Disabled
            </span>
            <div
              className={`mt-1 text-2xl font-black ${
                isDark ? "text-rose-300" : "text-rose-600"
              }`}
            >
              {metrics.inactive}
            </div>
          </div>

          <div
            className={`rounded-2xl border p-4 transition-colors ${
              isDark
                ? "border-sky-900/30 bg-sky-950/20"
                : "border-sky-200 bg-sky-50/60 shadow-sm"
            }`}
          >
            <span
              className={`text-[11px] font-medium ${
                isDark ? "text-sky-400" : "text-sky-700"
              }`}
            >
              Standalone B2B
            </span>
            <div
              className={`mt-1 text-2xl font-black ${
                isDark ? "text-sky-300" : "text-sky-600"
              }`}
            >
              {metrics.standalone}
            </div>
          </div>

          <div
            className={`rounded-2xl border p-4 col-span-2 sm:col-span-1 transition-colors ${
              isDark
                ? "border-purple-900/30 bg-purple-950/20"
                : "border-purple-200 bg-purple-50/60 shadow-sm"
            }`}
          >
            <span
              className={`text-[11px] font-medium ${
                isDark ? "text-purple-400" : "text-purple-700"
              }`}
            >
              SMK E-Commerce
            </span>
            <div
              className={`mt-1 text-2xl font-black ${
                isDark ? "text-purple-300" : "text-purple-600"
              }`}
            >
              {metrics.smk}
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="mt-8 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search tenant name, slug, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full rounded-2xl border px-4 py-2 text-xs focus:border-indigo-500 focus:outline-none transition ${
                  isDark
                    ? "border-slate-800 bg-slate-900/80 text-white placeholder-slate-500"
                    : "border-slate-300 bg-white text-slate-900 placeholder-slate-400 shadow-sm"
                }`}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className={`rounded-2xl border px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 transition ${
                isDark
                  ? "border-slate-800 bg-slate-900 text-slate-300"
                  : "border-slate-300 bg-white text-slate-700 shadow-sm"
              }`}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className={`rounded-2xl border px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 transition ${
                isDark
                  ? "border-slate-800 bg-slate-900 text-slate-300"
                  : "border-slate-300 bg-white text-slate-700 shadow-sm"
              }`}
            >
              <option value="ALL">All Sources</option>
              <option value="STANDALONE">Standalone</option>
              <option value="SMK_ECOMMERCE">SMK Store</option>
            </select>
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20"
          >
            <span>+</span> Create Standalone Tenant
          </button>
        </div>

        {/* Tenants Table */}
        <div
          className={`mt-6 rounded-3xl border overflow-hidden transition-colors ${
            isDark
              ? "border-slate-800 bg-slate-900/40 shadow-xl"
              : "border-slate-200 bg-white shadow-md"
          }`}
        >
          {loading ? (
            <div className={`p-12 text-center text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Loading tenants...
            </div>
          ) : errorMsg ? (
            <div className="p-12 text-center text-xs text-rose-500">{errorMsg}</div>
          ) : filteredTenants.length === 0 ? (
            <div className={`p-12 text-center text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              No tenants match your search filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr
                    className={`border-b font-semibold uppercase text-[10px] tracking-wider transition-colors ${
                      isDark
                        ? "border-slate-800/80 bg-slate-900/80 text-slate-400"
                        : "border-slate-200 bg-slate-100/70 text-slate-600"
                    }`}
                  >
                    <th className="py-3.5 px-4">Store / Organization</th>
                    <th className="py-3.5 px-4">Tenant Slug & URL</th>
                    <th className="py-3.5 px-4">Source</th>
                    <th className="py-3.5 px-4">Plan</th>
                    <th className="py-3.5 px-4">Service Status</th>
                    <th className="py-3.5 px-4 text-right">Integration & Access</th>
                  </tr>
                </thead>
                <tbody
                  className={`divide-y transition-colors ${
                    isDark ? "divide-slate-800/50" : "divide-slate-100"
                  }`}
                >
                  {filteredTenants.map((tenant) => {
                    const isActive = tenant.status === "ACTIVE";
                    const isBusy = actionLoading === tenant.id;

                    return (
                      <tr
                        key={tenant.id}
                        className={`transition group ${
                          isDark ? "hover:bg-slate-800/30" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-4 px-4">
                          <div
                            className={`font-bold text-sm ${
                              isDark ? "text-slate-100" : "text-slate-900"
                            }`}
                          >
                            {tenant.name}
                          </div>
                          <div
                            className={`text-[10px] font-mono ${
                              isDark ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            {tenant.id}
                          </div>
                        </td>

                        <td className="py-4 px-4 font-mono">
                          <span
                            className={`rounded-lg px-2 py-0.5 font-semibold ${
                              isDark
                                ? "bg-slate-800 text-indigo-300"
                                : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                            }`}
                          >
                            /{tenant.slug}
                          </span>
                        </td>

                        <td className="py-4 px-4">
                          {tenant.source === "SMK_ECOMMERCE" ? (
                            <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-medium text-purple-500 border border-purple-500/20">
                              SMK E-Commerce
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-medium text-sky-500 border border-sky-500/20">
                              Standalone B2B
                            </span>
                          )}
                        </td>

                        <td
                          className={`py-4 px-4 font-medium ${
                            isDark ? "text-slate-300" : "text-slate-700"
                          }`}
                        >
                          {tenant.plan_code || "STANDALONE"}
                        </td>

                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleToggleStatus(tenant)}
                              disabled={isBusy}
                              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                isActive
                                  ? "bg-emerald-500"
                                  : isDark
                                  ? "bg-slate-700"
                                  : "bg-slate-300"
                              } ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                  isActive ? "translate-x-5" : "translate-x-0"
                                }`}
                              />
                            </button>
                            <span
                              className={`text-xs font-semibold ${
                                isActive ? "text-emerald-500" : "text-rose-500"
                              }`}
                            >
                              {isActive ? "Active" : "Disabled"}
                            </span>
                          </div>
                        </td>

                        <td className="py-4 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEmbedModalTenant(tenant)}
                              className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition ${
                                isDark
                                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500 hover:text-white"
                                  : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white"
                              }`}
                            >
                              Embed Code
                            </button>

                            <a
                              href={`/${tenant.slug}/admin/login`}
                              target="_blank"
                              rel="noreferrer"
                              className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition ${
                                isDark
                                  ? "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
                                  : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900"
                              }`}
                            >
                              Admin Login ↗
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal: Create Standalone Tenant */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl transition-colors ${
              isDark
                ? "border-slate-800 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-900"
            }`}
          >
            <div
              className={`flex items-center justify-between border-b pb-4 ${
                isDark ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <div>
                <h3 className="text-lg font-bold">Create Standalone Tenant</h3>
                <p
                  className={`text-xs ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Provision an independent customer for standalone chatbot embedding.
                </p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className={`text-lg ${isDark ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-800"}`}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="mt-4 space-y-4">
              <div>
                <label
                  className={`text-xs font-semibold ${
                    isDark ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Company / Store Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corporation"
                  value={newTenant.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const autoSlug = name
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]/g, "-")
                      .replace(/-+/g, "-");
                    setNewTenant((prev) => ({
                      ...prev,
                      name,
                      slug: prev.slug === "" ? autoSlug : prev.slug,
                    }));
                  }}
                  className={`mt-1 w-full rounded-2xl border px-4 py-2 text-xs focus:border-indigo-500 focus:outline-none transition ${
                    isDark
                      ? "border-slate-800 bg-slate-950 text-white"
                      : "border-slate-300 bg-slate-50 text-slate-900"
                  }`}
                />
              </div>

              <div>
                <label
                  className={`text-xs font-semibold ${
                    isDark ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Unique Tenant Slug * (used in URL: /{newTenant.slug || "slug"})
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. acme"
                  value={newTenant.slug}
                  onChange={(e) =>
                    setNewTenant((prev) => ({
                      ...prev,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                    }))
                  }
                  className={`mt-1 w-full rounded-2xl border px-4 py-2 font-mono text-xs focus:border-indigo-500 focus:outline-none transition ${
                    isDark
                      ? "border-slate-800 bg-slate-950 text-indigo-300"
                      : "border-slate-300 bg-slate-50 text-indigo-700"
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className={`text-xs font-semibold ${
                      isDark ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    Store Admin Email
                  </label>
                  <input
                    type="email"
                    placeholder="admin@acme.com"
                    value={newTenant.ownerEmail}
                    onChange={(e) =>
                      setNewTenant((prev) => ({ ...prev, ownerEmail: e.target.value }))
                    }
                    className={`mt-1 w-full rounded-2xl border px-4 py-2 text-xs focus:border-indigo-500 focus:outline-none transition ${
                      isDark
                        ? "border-slate-800 bg-slate-950 text-white"
                        : "border-slate-300 bg-slate-50 text-slate-900"
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`text-xs font-semibold ${
                      isDark ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    Store Admin Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newTenant.ownerPassword}
                    onChange={(e) =>
                      setNewTenant((prev) => ({ ...prev, ownerPassword: e.target.value }))
                    }
                    className={`mt-1 w-full rounded-2xl border px-4 py-2 text-xs focus:border-indigo-500 focus:outline-none transition ${
                      isDark
                        ? "border-slate-800 bg-slate-950 text-white"
                        : "border-slate-300 bg-slate-50 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className={`text-xs font-semibold ${
                      isDark ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    Plan
                  </label>
                  <select
                    value={newTenant.planCode}
                    onChange={(e) =>
                      setNewTenant((prev) => ({ ...prev, planCode: e.target.value }))
                    }
                    className={`mt-1 w-full rounded-2xl border px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none transition ${
                      isDark
                        ? "border-slate-800 bg-slate-950 text-slate-200"
                        : "border-slate-300 bg-slate-50 text-slate-800"
                    }`}
                  >
                    <option value="STANDALONE_STARTER">Starter</option>
                    <option value="STANDALONE_PRO">Pro Plan</option>
                    <option value="STANDALONE_ENTERPRISE">Enterprise</option>
                  </select>
                </div>

                <div>
                  <label
                    className={`text-xs font-semibold ${
                      isDark ? "text-slate-300" : "text-slate-700"
                    }`}
                  >
                    Initial Status
                  </label>
                  <select
                    value={newTenant.status}
                    onChange={(e) =>
                      setNewTenant((prev) => ({
                        ...prev,
                        status: e.target.value as any,
                      }))
                    }
                    className={`mt-1 w-full rounded-2xl border px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none transition ${
                      isDark
                        ? "border-slate-800 bg-slate-950 text-slate-200"
                        : "border-slate-300 bg-slate-50 text-slate-800"
                    }`}
                  >
                    <option value="ACTIVE">Active (Enabled)</option>
                    <option value="INACTIVE">Inactive (Disabled)</option>
                  </select>
                </div>
              </div>

              {createError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-center text-xs text-rose-500">
                  {createError}
                </div>
              )}

              <div
                className={`flex items-center justify-end gap-3 pt-4 border-t ${
                  isDark ? "border-slate-800" : "border-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className={`rounded-2xl border px-4 py-2 text-xs font-semibold transition ${
                    isDark
                      ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-2xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 shadow-md"
                >
                  {createLoading ? "Creating..." : "Create Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Embed Snippet & Integration Guide */}
      {embedModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            className={`w-full max-w-2xl rounded-3xl border p-6 shadow-2xl transition-colors ${
              isDark
                ? "border-slate-800 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-900"
            }`}
          >
            <div
              className={`flex items-center justify-between border-b pb-4 ${
                isDark ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <div>
                <h3 className="text-lg font-bold">
                  Integration & Embed: {embedModalTenant.name}
                </h3>
                <p
                  className={`text-xs ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Embed this assistant onto any external website, shop, or web application.
                </p>
              </div>
              <button
                onClick={() => setEmbedModalTenant(null)}
                className={`text-lg ${isDark ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-800"}`}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-5 text-xs">
              {/* Option 1: Script Embed */}
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      isDark ? "text-indigo-300" : "text-indigo-600"
                    }`}
                  >
                    Option 1: JavaScript Widget Embed (Recommended)
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `<script src="${origin}/embed.js?tenant=${embedModalTenant.slug}&storeName=${encodeURIComponent(
                          embedModalTenant.name
                        )}" data-tenant-slug="${embedModalTenant.slug}" defer></script>`,
                        "script"
                      )
                    }
                    className="text-[11px] text-indigo-500 hover:text-indigo-600 font-bold"
                  >
                    {copiedSnippet === "script" ? "✓ Copied!" : "Copy Script Tag"}
                  </button>
                </div>
                <p
                  className={`text-[11px] mt-0.5 ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Paste this snippet right before the closing <code>&lt;/body&gt;</code> tag on any website (Shopify, WordPress, Webflow, custom site).
                </p>
                <div
                  className={`mt-2 rounded-2xl p-3 font-mono text-[11px] border overflow-x-auto ${
                    isDark
                      ? "bg-slate-950 text-slate-200 border-slate-800"
                      : "bg-slate-900 text-emerald-300 border-slate-800"
                  }`}
                >
                  {`<script src="${origin}/embed.js?tenant=${embedModalTenant.slug}&storeName=${encodeURIComponent(
                    embedModalTenant.name
                  )}" data-tenant-slug="${embedModalTenant.slug}" defer></script>`}
                </div>
              </div>

              {/* Option 2: Iframe Embed */}
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      isDark ? "text-indigo-300" : "text-indigo-600"
                    }`}
                  >
                    Option 2: Responsive Iframe Embed
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `<iframe src="${origin}/widget?tenant=${embedModalTenant.slug}" width="100%" height="650" frameborder="0"></iframe>`,
                        "iframe"
                      )
                    }
                    className="text-[11px] text-indigo-500 hover:text-indigo-600 font-bold"
                  >
                    {copiedSnippet === "iframe" ? "✓ Copied!" : "Copy Iframe"}
                  </button>
                </div>
                <div
                  className={`mt-2 rounded-2xl p-3 font-mono text-[11px] border overflow-x-auto ${
                    isDark
                      ? "bg-slate-950 text-slate-200 border-slate-800"
                      : "bg-slate-900 text-emerald-300 border-slate-800"
                  }`}
                >
                  {`<iframe src="${origin}/widget?tenant=${embedModalTenant.slug}" width="100%" height="650" frameborder="0"></iframe>`}
                </div>
              </div>

              {/* Option 3: Tenant Knowledge Base Admin URL */}
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      isDark ? "text-indigo-300" : "text-indigo-600"
                    }`}
                  >
                    Option 3: Tenant Admin & Document Upload Portal
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${origin}/${embedModalTenant.slug}/admin/login`,
                        "admin"
                      )
                    }
                    className="text-[11px] text-indigo-500 hover:text-indigo-600 font-bold"
                  >
                    {copiedSnippet === "admin" ? "✓ Copied!" : "Copy Link"}
                  </button>
                </div>
                <p
                  className={`text-[11px] mt-0.5 ${
                    isDark ? "text-slate-400" : "text-slate-500"
                  }`}
                >
                  Give this URL to the tenant administrator so they can upload their PDFs and FAQs.
                </p>
                <div
                  className={`mt-2 rounded-2xl p-3 font-mono border ${
                    isDark
                      ? "bg-slate-950 text-indigo-300 border-slate-800"
                      : "bg-slate-100 text-indigo-700 border-slate-300"
                  }`}
                >
                  {`${origin}/${embedModalTenant.slug}/admin/login`}
                </div>
              </div>
            </div>

            <div
              className={`mt-6 flex justify-end border-t pt-4 ${
                isDark ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <button
                onClick={() => setEmbedModalTenant(null)}
                className="rounded-2xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow-md"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
