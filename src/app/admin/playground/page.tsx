"use client";

import React, { useState } from "react";
import AdminHeader from "@/components/AdminHeader";

export default function PlaygroundPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      setLoading(true);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      });
      const data = await res.json();
      setResult(data);
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
        title="RAG Semantic Search Inspector"
        subtitle="Query Qdrant vectors and inspect dense similarity scores and prompt context grounding."
      />

      {/* Query Bar */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question (e.g., 'What is the return policy window?')..."
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:border-sky-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? "Searching Qdrant..." : "Search & Generate"}
          </button>
        </form>
      </div>

      {/* Results */}
      {result && (
        <div className="mt-6 space-y-6">
          {/* Answer Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-sky-600">Grounded Answer</p>
            <div className="mt-2 text-sm leading-relaxed text-slate-800 whitespace-pre-line">
              {result.answer}
            </div>
          </div>

          {/* Qdrant Vectors Card */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Retrieved Qdrant Points ({result.sources?.length || 0} vectors matched)
              </p>
              <span className="text-xs text-slate-400">Cosine Distance Metric</span>
            </div>

            <div className="mt-4 space-y-3">
              {result.sources?.length === 0 ? (
                <p className="text-xs text-slate-400">No vector matches found in Qdrant.</p>
              ) : (
                result.sources.map((s: any, idx: number) => (
                  <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>📄 {s.document} (Chunk #{s.chunk_index})</span>
                      <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] text-sky-700 font-semibold">
                        Similarity: {Math.round(s.relevance_score * 100)}%
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

