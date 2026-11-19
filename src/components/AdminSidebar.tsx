"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ResetPasswordModal from "./ResetPasswordModal";
import { getTenantFromUrl, buildTenantPath } from "@/lib/tenantUrl";

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [tenant, setTenant] = useState<string>("smk_tenant");

  useEffect(() => {
    setTenant(getTenantFromUrl("smk_tenant"));
  }, [pathname]);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("rag_user");
      if (storedUser) {
        const u = JSON.parse(storedUser);
        if (u.email) {
          setUserEmail(u.email);
          return;
        }
      }
      const storedToken = localStorage.getItem("rag_token") || localStorage.getItem("token");
      if (storedToken) {
        // Decode JWT payload without library for display
        const payloadBase64 = storedToken.split(".")[1];
        if (payloadBase64) {
          const json = JSON.parse(atob(payloadBase64));
          if (json.email) setUserEmail(json.email);
        }
      }
    } catch {
      // Ignore token parse failure
    }
  }, []);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      const token = localStorage.getItem("rag_token") || localStorage.getItem("token");
      const targetTenant = tenant || localStorage.getItem("selected_tenant") || "smk_tenant";
      if (token) {
        await fetch(`/api/${encodeURIComponent(targetTenant)}/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token }),
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem("rag_token");
      localStorage.removeItem("token");
      localStorage.removeItem("rag_user");
      router.push(buildTenantPath("/admin/login", tenant));
    }
  };

  const navItems = [
    {
      href: "/",
      label: "Overview",
      icon: "🏠",
      description: "Portal overview & shortcuts",
    },
    {
      href: "/admin/documents",
      label: "Document Hub",
      icon: "📁",
      description: "Policies, guides & files",
    },
    {
      href: "/admin/playground",
      label: "Search & Preview",
      icon: "🔍",
      description: "Test questions & answers",
    },
    {
      href: "/admin/team",
      label: "Team Management",
      icon: "👥",
      description: "Support team members",
    },
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white px-4 py-6 border-r border-slate-200">
      <div>
        {/* Brand */}
        <div className="mb-8 px-2 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/images/logo/smk.jpg"
              alt="SMK Logo"
              className="h-10 w-10 rounded-2xl object-contain shadow-sm border border-slate-100 group-hover:scale-105 transition"
            />
            <div>
              <span className="block text-base font-extrabold text-slate-900 leading-tight">
                SMK Knowledge
              </span>
              <span className="block text-[11px] font-semibold text-sky-600">
                Help Center & Documents
              </span>
            </div>
          </Link>

          {/* Close button on mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Knowledge Navigation
          </p>
          {navItems.map((item) => {
            const itemHref = buildTenantPath(item.href, tenant);
            const isActive = pathname === itemHref || pathname === item.href;
            return (
              <Link
                key={item.href}
                href={itemHref}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition ${
                  isActive
                    ? "bg-sky-600 text-white shadow-sm shadow-sky-600/30"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <div className="flex-1">
                  <span className="block leading-none">{item.label}</span>
                  <span
                    className={`block text-[10px] mt-0.5 ${
                      isActive ? "text-sky-100" : "text-slate-400 group-hover:text-slate-500"
                    }`}
                  >
                    {item.description}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* System & Widget Links */}
        <div className="mt-8 space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Live Interfaces
          </p>
          <Link
            href={buildTenantPath("/widget", tenant)}
            target="_blank"
            className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            <span className="text-base">💬</span>
            <div className="flex-1">
              <span>Chatbot Widget</span>
              <span className="ml-1 text-[10px] text-sky-600">↗</span>
            </div>
          </Link>
        </div>
      </div>

      {/* Footer Profile & Logout */}
      <div className="border-t border-slate-100 pt-4">
        {/* Connected DB status */}
        <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-500">Knowledge Base</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Connected
          </span>
        </div>

        {/* User Card */}
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-xs font-bold text-purple-700">
              {(userEmail || "A").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-900">{userEmail || "Support Admin"}</p>
              <p className="text-[10px] text-purple-600 font-semibold">SUPPORT ADMIN</p>
            </div>
          </div>
        </div>

        {/* Reset Password Button */}
        <button
          onClick={() => setResetPasswordOpen(true)}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <span>🔑</span>
          <span>Reset Password</span>
        </button>

        {/* Sign Out Button */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 py-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
        >
          <span>🚪</span>
          <span>{loggingOut ? "Signing Out..." : "Sign Out"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <ResetPasswordModal
        isOpen={resetPasswordOpen}
        onClose={() => setResetPasswordOpen(false)}
      />
      {/* Mobile Top Bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/images/logo/smk.jpg"
            alt="SMK Logo"
            className="h-8 w-8 rounded-xl object-contain shadow-sm border border-slate-100"
          />
          <span className="font-extrabold text-sm text-slate-900">SMK Knowledge</span>
        </Link>

        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-xl border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
          aria-label="Open menu"
        >
          <span className="text-base">☰</span>
        </button>
      </div>

      {/* Desktop Permanent Sidebar */}
      <aside className="hidden md:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85%] h-full z-10 shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

