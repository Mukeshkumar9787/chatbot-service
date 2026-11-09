"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";

export default function DocumentAdminPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Chunks inspector
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  const getToken = () => {
    return localStorage.getItem("rag_token") || localStorage.getItem("token") || "";
  };

  const fetchDocs = async () => {
    const token = getToken();
    if (!token) {
      router.push("/admin/login");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/documents", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        alert("Session expired or administrator access revoked.");
        router.push("/admin/login");
        return;
      }

      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents || []);
      }
    } catch (err: any) {
      setMessage("Error loading documents: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const token = getToken();
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      setUploading(true);
      setMessage("Parsing, computing vector embeddings, and indexing in Qdrant...");

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage(`Successfully indexed ${data.uploaded_count} file(s) into Qdrant!`);
        await fetchDocs();
      } else {
        setMessage("Upload failed: " + (data.error || "Unknown error"));
      }
    } catch (err: any) {
      setMessage("Upload error: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setMessage(""), 5000);
    }
  };

  const handleDelete = async (docId: string, name: string) => {
    if (!confirm(`Delete ${name} and all its vectors from Qdrant?`)) return;

    const token = getToken();
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchDocs();
      } else {
        const data = await res.json();
        alert("Delete failed: " + data.error);
      }
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleInspectChunks = async (docId: string) => {
    setSelectedDocId(docId);
    setLoadingChunks(true);
    const token = getToken();

    try {
      const res = await fetch(`/api/documents/${docId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setChunks(data.chunks || []);
      }
    } catch (err: any) {
      alert("Error inspecting chunks: " + err.message);
    } finally {
      setLoadingChunks(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Navigation Header */}
      <AdminHeader
        title="Qdrant Document Hub"
        subtitle="Ingest documents into Qdrant for dense semantic retrieval and grounded AI generation."
        badge="Qdrant Connected"
      />

      {/* Upload Dropzone */}
      <div className="relative mb-8 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8 text-center transition hover:border-sky-500 hover:bg-sky-50/20">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.csv,.json"
          onChange={handleFileUpload}
          disabled={uploading}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
          <span className="text-2xl">📤</span>
        </div>
        <h3 className="mt-4 text-base font-bold text-slate-900">
          {uploading ? "Ingesting & indexing vectors in Qdrant..." : "Click or drag & drop files here"}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Supports PDF, Markdown (.md), Plain Text (.txt), CSV, and JSON.
        </p>
        {message && (
          <p className="mt-3 text-xs font-semibold text-sky-600">{message}</p>
        )}
      </div>

      {/* Documents Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-bold text-slate-900">Indexed Collections ({documents.length})</h3>
          <button
            onClick={fetchDocs}
            className="text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading collections from Qdrant...</div>
        ) : documents.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No documents indexed in Qdrant yet. Upload a policy or manual above!
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between px-6 py-4 transition hover:bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                    📄
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{doc.filename}</p>
                    <p className="text-xs text-slate-400">
                      Qdrant Vectors: <span className="font-semibold text-sky-600">{doc.chunk_count}</span> • Indexed{" "}
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleInspectChunks(doc.id)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Inspect Vectors
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id, doc.filename)}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inspect Modal */}
      {selectedDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-bold text-slate-900">Vector Payloads in Qdrant</h3>
              <button
                onClick={() => setSelectedDocId(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6 space-y-3">
              {loadingChunks ? (
                <p className="text-center text-sm text-slate-500">Querying Qdrant points...</p>
              ) : chunks.length === 0 ? (
                <p className="text-center text-sm text-slate-400">No vectors found.</p>
              ) : (
                chunks.map((c, i) => (
                  <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-bold text-slate-700">
                      Chunk #{c.chunk_index + 1} of {c.total_chunks} ({c.char_count} chars)
                    </p>
                    <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{c.content}</p>
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

