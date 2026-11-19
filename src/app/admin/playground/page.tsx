"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";
import MarkdownRenderer from "@/components/MarkdownRenderer";

export default function PlaygroundPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number>(0);
  const [selectedTenant, setSelectedTenant] = useState<string>("tenant_smk_default");

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

  useEffect(() => {
    const token = localStorage.getItem("rag_token") || localStorage.getItem("token");
    if (!token) {
      router.push("/admin/login");
    }
  }, [router]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      setLoading(true);
      setResult({ answer: "", sources: [] });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": selectedTenant,
        },
        body: JSON.stringify({
          message: query,
          tenantId: selectedTenant,
        }),
      });

      if (res.status === 429) {
        const errorData = await res.json().catch(() => ({}));
        const retryAfter =
          errorData.retryAfterSeconds ||
          parseInt(res.headers.get("Retry-After") || "30", 10) ||
          30;
        setRateLimitCooldown(retryAfter);
        setResult({
          answer: `⏳ ${
            errorData.error ||
            `Please wait ${retryAfter}s before asking another question.`
          }`,
          sources: [],
        });
        setLoading(false);
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(trimmed.slice(6));
              if (event.type === "meta") {
                setResult((prev: any) => ({
                  ...prev,
                  sources: event.sources || [],
                }));
              } else if (event.type === "chunk") {
                accumulated += event.text;
                setResult((prev: any) => ({
                  ...prev,
                  answer: accumulated,
                }));
              } else if (event.type === "done") {
                if (event.answer) {
                  accumulated = event.answer;
                  setResult((prev: any) => ({
                    ...prev,
                    answer: accumulated,
                  }));
                }
              }
            } catch {
              // Ignore partial parse
            }
          }
        }
      } else {
        const data = await res.json();
        setResult(data);
      }
    } catch (err: any) {
      alert("Query failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <AdminHeader
        title="Question & Answer Preview"
        subtitle="Test customer questions and preview how answers are generated from store policies."
      />

      {/* Tenant Collection Selector */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">🏢 Target Vector Collection:</span>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none"
          >
            <option value="tenant_smk_default">SMK (Default - store_knowledge_base)</option>
            <option value="blipkart">Blipkart (kb_blipkart)</option>
          </select>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">
          Queries will search only the selected store's vector collection
        </span>
      </div>

      {/* Query Bar */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {rateLimitCooldown > 0 && (
          <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            ⏳ Please wait <strong>{rateLimitCooldown}s</strong> before submitting another question.
          </div>
        )}
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            value={query}
            disabled={loading || rateLimitCooldown > 0}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              rateLimitCooldown > 0
                ? `Please wait ${rateLimitCooldown}s...`
                : "Ask a question (e.g., 'What is the return policy window?')..."
            }
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-sky-500 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || rateLimitCooldown > 0}
            className="rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {rateLimitCooldown > 0
              ? `Please wait ${rateLimitCooldown}s`
              : loading
              ? "Finding answer..."
              : "Search & Preview Answer"}
          </button>
        </form>
      </div>

      {/* Results */}
      {result && (
        <div className="mt-6 space-y-6">
          {/* Answer Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-sky-600">Answer Preview</p>
            <div className="mt-2 text-sm leading-relaxed text-slate-800">
              <MarkdownRenderer content={result.answer} />
            </div>
          </div>

          {/* Matching Excerpts Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Matching Document Excerpts ({result.sources?.length || 0} found)
              </p>
              <span className="text-xs text-slate-400">Match Relevance</span>
            </div>

            <div className="mt-4 space-y-3">
              {result.sources?.length === 0 ? (
                <p className="text-xs text-slate-400">No matching document excerpts found.</p>
              ) : (
                result.sources.map((s: any, idx: number) => (
                  <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>📄 {s.document} (Section #{s.chunk_index + 1})</span>
                      <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] text-sky-700 font-semibold">
                        Relevance: {Math.round(s.relevance_score * 100)}%
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600 italic leading-relaxed">
                      "{s.snippet}"
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

