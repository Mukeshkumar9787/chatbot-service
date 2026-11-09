import Link from "next/link";
import React from "react";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3.5 py-1 text-xs font-semibold text-sky-800">
          <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          Powered by Qdrant Vector DB & Full-Stack Next.js
        </span>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          SMK Intelligent Chatbot & Knowledge Hub
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
          Upload store policies, product catalogs, and guides. The chatbot embeds and stores them directly in Qdrant, answering queries with verified document grounding.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
              Upload PDF, DOCX, TXT, CSV, or Markdown documents directly into the Qdrant vector index.
            </p>
          </div>
          <span className="mt-6 text-xs font-semibold text-emerald-600 group-hover:underline">
            Manage Documents →
          </span>
        </Link>

        {/* Card 3: RAG Playground */}
        <Link
          href="/admin/playground"
          className="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-sky-500 hover:shadow-lg"
        >
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl group-hover:scale-110 transition">
              🔍
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">RAG Playground</h3>
            <p className="mt-2 text-xs text-slate-500">
              Query the vector database and inspect exact top-k chunks and cosine similarity scores.
            </p>
          </div>
          <span className="mt-6 text-xs font-semibold text-indigo-600 group-hover:underline">
            Open Inspector →
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

      {/* Integration Code Snippet Box */}
      <div className="mt-12 rounded-3xl border border-slate-200 bg-slate-900 p-8 text-white shadow-xl">
        <h3 className="text-lg font-bold">1-Line E-Commerce Embedding Script</h3>
        <p className="mt-1 text-xs text-slate-400">
          Embed this AI assistant into any store page or external portal with a single script tag:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 font-mono text-xs text-sky-300">
          {`<script src="http://localhost:8005/embed.js" defer></script>`}
        </pre>
      </div>
    </div>
  );
}

