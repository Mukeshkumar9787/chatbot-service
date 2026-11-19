"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getTenantFromUrl, buildTenantPath } from "@/lib/tenantUrl";

const PRESET_COLORS = [
  { name: "Brand Blue", hex: "#3C50E0" },
  { name: "Ocean Sky", hex: "#0284C7" },
  { name: "Emerald", hex: "#059669" },
  { name: "Violet", hex: "#7C3AED" },
  { name: "Rose", hex: "#E11D48" },
  { name: "Amber", hex: "#D97706" },
  { name: "Slate", hex: "#0F172A" },
];

const FONT_OPTIONS = [
  { id: "inter", name: "Inter", family: "'Inter', sans-serif", description: "Crisp, clean & modern sans-serif" },
  { id: "poppins", name: "Poppins", family: "'Poppins', sans-serif", description: "Geometric, friendly & engaging" },
  { id: "plus-jakarta-sans", name: "Plus Jakarta Sans", family: "'Plus Jakarta Sans', sans-serif", description: "Contemporary premium neo-grotesque" },
  { id: "roboto", name: "Roboto", family: "'Roboto', sans-serif", description: "Balanced, neutral & highly legible" },
  { id: "outfit", name: "Outfit", family: "'Outfit', sans-serif", description: "Sleek, rounded modern tech aesthetic" },
  { id: "euclid-circular-a", name: "Euclid Circular A", family: "'Euclid Circular A', sans-serif", description: "Signature luxury geometric brand font" },
  { id: "playfair-display", name: "Playfair Display", family: "'Playfair Display', serif", description: "Sophisticated editorial & luxury serif" },
];

export default function BrandingAdminPage() {
  const router = useRouter();
  const [selectedTenant, setSelectedTenant] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return getTenantFromUrl("smk_tenant");
    }
    return "smk_tenant";
  });

  const [assistantName, setAssistantName] = useState<string>("");
  const [supportEmail, setSupportEmail] = useState<string>("");
  const [primaryColor, setPrimaryColor] = useState<string>("#3C50E0");
  const [accentColor, setAccentColor] = useState<string>("#0EA5E9");
  const [fontFamily, setFontFamily] = useState<string>("Inter");
  const [storeName, setStoreName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isStoreInactive, setIsStoreInactive] = useState<boolean>(false);

  const getToken = () => {
    return localStorage.getItem("rag_token") || localStorage.getItem("token") || "";
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4500);
  };

  useEffect(() => {
    const t = getTenantFromUrl("smk_tenant");
    setSelectedTenant(t);
    fetchBranding(t);
  }, []);

  const fetchBranding = async (tenantKey: string) => {
    try {
      setLoading(true);
      const statusRes = await fetch(`/api/${encodeURIComponent(tenantKey)}/status`);
      if (statusRes.status === 404) {
        setIsStoreInactive(true);
        setLoading(false);
        return;
      }
      const statusData = await statusRes.json().catch(() => ({}));
      if (statusData && (statusData.active === false || statusData.status === "INACTIVE" || statusData.error)) {
        setIsStoreInactive(true);
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/${encodeURIComponent(tenantKey)}/branding`);
      if (res.status === 404) {
        setIsStoreInactive(true);
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.success && data.branding) {
        const effectiveStore = data.branding.storeName || data.name || tenantKey;
        setPrimaryColor(data.branding.primaryColor || "#3C50E0");
        setAccentColor(data.branding.accentColor || "#0EA5E9");
        setStoreName(effectiveStore);
        setFontFamily(data.branding.fontFamily || "Inter");
        setSupportEmail(data.branding.supportEmail || "");
        setLogoUrl(data.branding.logoUrl || null);
        setAssistantName(
          data.branding.assistantName ||
            (effectiveStore ? `${effectiveStore} Assistant` : "Store Assistant")
        );
      }
    } catch (e) {
      console.warn("Could not load branding:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const token = getToken();
    if (!token) {
      router.push(buildTenantPath("/admin/login", selectedTenant));
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/${encodeURIComponent(selectedTenant)}/branding`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          primaryColor,
          accentColor,
          assistantName,
          supportEmail,
          fontFamily,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast("🎨 Assistant branding and theme updated successfully!");
      } else {
        alert("Failed to save branding: " + (data.error || "Unknown error"));
      }
    } catch (err: any) {
      alert("Error saving branding: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-10 font-sans flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-slate-200 border-t-slate-800" />
          <p className="text-xs font-semibold text-slate-500 animate-pulse">
            Loading store branding...
          </p>
        </div>
      </div>
    );
  }

  if (isStoreInactive) {
    return (
      <div className="p-6 md:p-10 font-sans flex items-center justify-center min-h-[60vh]">
        <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-3xl text-rose-600 mb-4">
            🚫
          </div>
          <h2 className="text-xl font-bold text-slate-900">Store or Chatbot Inactive</h2>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            The AI Chatbot assistant or store for{" "}
            <span className="font-semibold text-slate-700">{selectedTenant}</span> is currently
            inactive or disabled. Please enable it in the e-commerce store settings or platform admin portal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 font-sans">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-white text-lg shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                🎨
              </span>
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Chatbot Branding & Theme
                </h1>
                <p className="text-xs text-slate-500">
                  Customize the styling, assistant title, color scheme, and support email for{" "}
                  <span className="font-semibold text-slate-800">{storeName || selectedTenant}</span>.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: primaryColor }} />
              <span>Store: {storeName || selectedTenant}</span>
            </span>

            <button
              onClick={() => handleSave()}
              disabled={saving || loading}
              style={{ backgroundColor: primaryColor }}
              className="flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50 transition cursor-pointer"
            >
              {saving ? "Saving..." : "Save Branding Changes"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
            <p className="mt-3 text-xs font-medium text-slate-500">Loading store branding...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Card 1: Identity & General Settings */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-base font-bold text-slate-900">Assistant Identity</h3>
                <p className="text-xs text-slate-500">
                  Names and contact links displayed to customers inside the chat widget.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Assistant Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    placeholder="e.g. Blipkart Assistant"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": primaryColor } as any}
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Appears in the header title, minimized launcher pill, and greetings.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Customer Support Email
                  </label>
                  <input
                    type="email"
                    required
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="e.g. support@blipkart.com"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": primaryColor } as any}
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    Displayed as a direct contact link if a customer query is ungrounded in documentation.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Color Palette */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-base font-bold text-slate-900">Theme & Palette</h3>
                <p className="text-xs text-slate-500">
                  Syncs with your e-commerce website branding and controls widget visual styling.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Primary Color Picker */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Primary Theme Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-xl border border-slate-200 bg-transparent p-0.5 shadow-sm"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-32 rounded-xl border border-slate-200 px-3.5 py-2 font-mono text-xs uppercase text-slate-800 focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": primaryColor } as any}
                    />
                  </div>

                  <div className="mt-4">
                    <span className="block text-[11px] font-semibold text-slate-500 mb-2">
                      Quick Preset Colors:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_COLORS.map((p) => (
                        <button
                          key={p.hex}
                          type="button"
                          onClick={() => setPrimaryColor(p.hex)}
                          className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
                            primaryColor.toLowerCase() === p.hex.toLowerCase()
                              ? "border-slate-800 bg-white font-bold shadow-sm"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: p.hex }}
                          />
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Accent Color Picker */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-5">
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-xl border border-slate-200 bg-transparent p-0.5 shadow-sm"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-32 rounded-xl border border-slate-200 px-3.5 py-2 font-mono text-xs uppercase text-slate-800 focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": primaryColor } as any}
                    />
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">
                    Applied to secondary action pills, highlight indicators, and badges.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3: Typography & Font Family */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>🔤</span> Typography &amp; Font Family
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select your preferred font family. Automatically synchronizes with your website theme and chatbot assistant.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  Active Font: <strong className="font-bold text-slate-900">{fontFamily}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {FONT_OPTIONS.map((f) => {
                  const isSelected = fontFamily.toLowerCase() === f.name.toLowerCase();
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFontFamily(f.name)}
                      className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition cursor-pointer ${
                        isSelected
                          ? "border-slate-800 bg-slate-50/70 ring-2 ring-slate-800/10 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/40"
                      }`}
                      style={{ fontFamily: f.family }}
                    >
                      <div className="flex items-start justify-between w-full">
                        <div>
                          <p className="text-sm font-bold text-slate-900 group-hover:text-slate-800 transition-colors">
                            {f.name}
                          </p>
                          <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                            {f.description}
                          </p>
                        </div>
                        {isSelected && (
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white text-[10px] font-bold"
                            style={{ backgroundColor: primaryColor }}
                          >
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                        <span>Aa Bb Gg 123 — The quick brown fox jumps</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card 4: Interactive Live Preview */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-base font-bold text-slate-900">Live Widget Preview</h3>
                <p className="text-xs text-slate-500">
                  Real-time visual simulation of how the widget appears to visitors on your store.
                </p>
              </div>

              <div className="flex flex-col lg:flex-row items-start gap-8">
                {/* Simulated Chatbot Container */}
                <div
                  className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden"
                  style={{ fontFamily: fontFamily ? `"${fontFamily}", sans-serif` : undefined }}
                >
                  {/* Header */}
                  <div className="relative border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ backgroundColor: primaryColor }}
                    />
                    <div className="flex items-center gap-3">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={storeName}
                          className="h-8 w-8 rounded-xl object-contain border border-slate-100 bg-white"
                        />
                      ) : (
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-xl text-white font-extrabold text-xs shadow-sm"
                          style={{ backgroundColor: primaryColor }}
                        >
                          {(storeName || selectedTenant || "S").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h5 className="text-xs font-bold text-slate-900 leading-tight">
                          {assistantName || "Store Assistant"}
                        </h5>
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {storeName || selectedTenant} Active Assistant
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Messages Body */}
                  <div className="p-4 space-y-3 bg-slate-50/30 text-xs">
                    <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-700 text-xs shadow-sm">
                      👋 Hi! I am your {storeName || selectedTenant} assistant. How can I help you today?
                    </div>

                    <div
                      className="ml-auto max-w-[80%] rounded-2xl px-3.5 py-2 text-white text-xs shadow-sm"
                      style={{ backgroundColor: primaryColor }}
                    >
                      What is your return policy?
                    </div>

                    <div className="max-w-[85%] rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-700 text-xs shadow-sm">
                      Items can be returned within 30 days of delivery.
                    </div>
                  </div>

                  {/* Input Bar */}
                  <div className="border-t border-slate-100 p-3 flex items-center gap-2 bg-white">
                    <input
                      type="text"
                      disabled
                      placeholder={`Ask ${assistantName || "Store Assistant"}...`}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-slate-50"
                    />
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-xl text-white text-xs shadow-sm"
                      style={{ backgroundColor: primaryColor }}
                    >
                      ➤
                    </div>
                  </div>
                </div>

                {/* Settings Explanation */}
                <div className="flex-1 space-y-4 text-xs text-slate-600">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <span className="font-bold text-slate-800">Automatic Sync from E-Commerce:</span>
                    <p className="mt-1 text-slate-500 leading-relaxed">
                      Whenever your store settings or branding change in the main platform, colors and store
                      information automatically flow to this assistant. You can also override and fine-tune
                      specific colors here at any time.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <span className="font-bold text-slate-800">Support Routing:</span>
                    <p className="mt-1 text-slate-500 leading-relaxed">
                      If a user asks a question that is not covered in your uploaded documentation, the chatbot
                      will recommend contacting your dedicated email at{" "}
                      <span className="font-mono text-slate-700">{supportEmail || "your support email"}</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                style={{ backgroundColor: primaryColor }}
                className="rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-md hover:brightness-110 disabled:opacity-50 transition cursor-pointer"
              >
                {saving ? "Saving Branding..." : "Save Branding Changes"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/95 px-5 py-3.5 text-sm font-semibold text-white shadow-2xl backdrop-blur transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">
            ✓
          </span>
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
