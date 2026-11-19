"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const isMarkdownFile = (filename?: string) => {
  return filename?.toLowerCase().endsWith(".md") || false;
};

interface QueueItem {
  id: string;
  name: string;
  size: number;
  status: "queued" | "uploading" | "completed" | "failed";
  chunkCount?: number;
  error?: string;
  file: File;
}

export default function DocumentAdminPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<string>("tenant_smk_default");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const urlTenant = urlParams.get("tenant") || urlParams.get("tenantId");
      const storedTenant =
        localStorage.getItem("rag_tenant") ||
        localStorage.getItem("selected_tenant") ||
        urlTenant;

      if (storedTenant) {
        setSelectedTenant(storedTenant.trim());
      }
    }
  }, []);

  // Deletion animation state per document: "deleting" | "deleted"
  const [deletingStates, setDeletingStates] = useState<{
    [docId: string]: "deleting" | "deleted";
  }>({});

  // Upload queue for one-by-one sequential uploading
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const uploadQueueRef = useRef<QueueItem[]>([]);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number>(-1);
  const isProcessingQueueRef = useRef(false);

  // Synchronize queue ref with state helper
  const updateQueueItem = (index: number, patch: Partial<QueueItem>) => {
    uploadQueueRef.current = uploadQueueRef.current.map((item, idx) =>
      idx === index ? { ...item, ...patch } : item
    );
    setUploadQueue([...uploadQueueRef.current]);
  };

  // Chunks & Document inspector
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; filename: string } | null>(null);
  const [chunks, setChunks] = useState<any[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [docViewTab, setDocViewTab] = useState<"preview" | "sections">("preview");
  const [copiedDoc, setCopiedDoc] = useState(false);

  const getToken = () => {
    return localStorage.getItem("rag_token") || localStorage.getItem("token") || "";
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4500);
  };

  const fetchDocs = async (showLoading = true) => {
    const token = getToken();
    if (!token) {
      router.push("/admin/login");
      return;
    }

    try {
      if (showLoading) setLoading(true);
      const res = await fetch(`/api/${encodeURIComponent(selectedTenant)}/documents`, {
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
      showToast("Error loading documents: " + err.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [selectedTenant]);

  // Format bytes helper
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Add selected files to queue
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newQueueItems: QueueItem[] = Array.from(files).map((file, idx) => ({
      id: `${Date.now()}_${idx}_${file.name}`,
      name: file.name,
      size: file.size,
      status: "queued",
      file,
    }));

    uploadQueueRef.current = [...uploadQueueRef.current, ...newQueueItems];
    setUploadQueue([...uploadQueueRef.current]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Process queue sequentially one by one
  useEffect(() => {
    const hasQueued = uploadQueue.some((item) => item.status === "queued");
    if (!hasQueued || isProcessingQueueRef.current) {
      if (!hasQueued && uploading) {
        setUploading(false);
        setCurrentUploadIndex(-1);
      }
      return;
    }

    const runQueue = async () => {
      isProcessingQueueRef.current = true;
      setUploading(true);

      try {
        while (true) {
          const nextIndex = uploadQueueRef.current.findIndex((item) => item.status === "queued");
          if (nextIndex === -1) {
            break;
          }

          const currentItem = uploadQueueRef.current[nextIndex];
          setCurrentUploadIndex(nextIndex);
          updateQueueItem(nextIndex, { status: "uploading" });

          const token = getToken();
          try {
            const formData = new FormData();
            formData.append("files", currentItem.file);

            const res = await fetch(`/api/${encodeURIComponent(selectedTenant)}/documents/upload`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });

            const data = await res.json();
            if (res.ok && data.success && data.documents && data.documents.length > 0) {
              const uploadedDoc = data.documents[0];
              updateQueueItem(nextIndex, {
                status: "completed",
                chunkCount: uploadedDoc.chunk_count,
              });
              // Refresh list of documents in real-time as each file finishes, without blocking loader
              await fetchDocs(false);
            } else {
              const errMsg = data.errors?.[0]?.error || data.error || "Upload failed";
              updateQueueItem(nextIndex, {
                status: "failed",
                error: errMsg,
              });
            }
          } catch (err: any) {
            updateQueueItem(nextIndex, {
              status: "failed",
              error: err.message || "Network error",
            });
          }
        }
      } finally {
        isProcessingQueueRef.current = false;
        setUploading(false);
        setCurrentUploadIndex(-1);
      }
    };

    runQueue();
  }, [uploadQueue, uploading]);

  // Clear completed or failed queue items
  const handleClearQueue = () => {
    if (uploading) return;
    uploadQueueRef.current = [];
    setUploadQueue([]);
  };

  // Delete a single document with Gmail-style inline animation and non-blocking update
  const handleDelete = async (docId: string, name: string) => {
    if (!confirm(`Delete "${name}" from the store knowledge base?`)) return;

    // 1. Immediately mark as "deleting" to render deleting status on document row
    setDeletingStates((prev) => ({ ...prev, [docId]: "deleting" }));

    const token = getToken();
    try {
      const res = await fetch(`/api/${encodeURIComponent(selectedTenant)}/documents/${encodeURIComponent(docId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        // 2. Mark as "deleted" to trigger the slide-out and height collapse animation
        setDeletingStates((prev) => ({ ...prev, [docId]: "deleted" }));

        if (selectedDoc?.id === docId) {
          setSelectedDoc(null);
          setChunks([]);
        }

        showToast(`Deleted "${name}" from knowledge base.`);

        // 3. Remove document from state after animation completes (400ms), without blocking loader
        setTimeout(() => {
          setDocuments((prev) => prev.filter((d) => d.id !== docId));
          setDeletingStates((prev) => {
            const next = { ...prev };
            delete next[docId];
            return next;
          });
          // Background sync
          fetchDocs(false);
        }, 400);
      } else {
        const data = await res.json();
        alert("Delete failed: " + (data.error || "Unknown error"));
        setDeletingStates((prev) => {
          const next = { ...prev };
          delete next[docId];
          return next;
        });
      }
    } catch (err: any) {
      alert("Delete failed: " + err.message);
      setDeletingStates((prev) => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
    }
  };

  // Delete all documents in the knowledge base with animated collapse
  const handleDeleteAll = async () => {
    if (documents.length === 0) return;

    const confirmed = confirm(
      `Are you sure you want to delete ALL ${documents.length} document(s) from the store knowledge base?\n\nThis will permanently wipe all indexed vector chunks from Qdrant. This action cannot be undone.`
    );
    if (!confirmed) return;

    // Mark all documents as "deleting"
    const allDeleting: { [id: string]: "deleting" } = {};
    documents.forEach((d) => {
      allDeleting[d.id] = "deleting";
    });
    setDeletingStates(allDeleting);
    setDeletingAll(true);

    const token = getToken();
    try {
      const res = await fetch(`/api/${encodeURIComponent(selectedTenant)}/documents`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Trigger collapse animation across all items
        const allDeleted: { [id: string]: "deleted" } = {};
        documents.forEach((d) => {
          allDeleted[d.id] = "deleted";
        });
        setDeletingStates(allDeleted);

        showToast("All documents have been removed from the knowledge base.");
        setSelectedDoc(null);
        setChunks([]);

        setTimeout(() => {
          setDocuments([]);
          setDeletingStates({});
          fetchDocs(false);
        }, 400);
      } else {
        alert("Failed to delete all documents: " + (data.error || "Unknown error"));
        setDeletingStates({});
      }
    } catch (err: any) {
      alert("Delete all failed: " + err.message);
      setDeletingStates({});
    } finally {
      setDeletingAll(false);
    }
  };

  const handleCloseDocModal = () => {
    setSelectedDoc(null);
    setChunks([]);
    setDocViewTab("preview");
  };

  const handleInspectDoc = async (docId: string, filename: string) => {
    setSelectedDoc({ id: docId, filename });
    setChunks([]);
    setDocViewTab("preview");
    setLoadingChunks(true);
    setCopiedDoc(false);
    const token = getToken();

    try {
      const res = await fetch(`/api/${encodeURIComponent(selectedTenant)}/documents/${encodeURIComponent(docId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setChunks(data.chunks || []);
      }
    } catch (err: any) {
      alert("Error inspecting document: " + err.message);
    } finally {
      setLoadingChunks(false);
    }
  };

  const completedCount = uploadQueue.filter((q) => q.status === "completed").length;
  const failedCount = uploadQueue.filter((q) => q.status === "failed").length;
  const progressPercent =
    uploadQueue.length > 0
      ? Math.round(((completedCount + failedCount) / uploadQueue.length) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 relative">
      {/* Navigation Header */}
      <AdminHeader
        title="Store Documents & Knowledge Hub"
        subtitle="Upload store policies, shipping guides, and product FAQs to power customer support answers."
        badge="Knowledge Base Active"
      />

      {/* Tenant Knowledge Base Selector */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/80 to-indigo-50/80 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white text-base shadow-sm">
            🏢
          </span>
          <div>
            <h4 className="text-xs font-bold text-slate-800">Tenant Vector Knowledge Base</h4>
            <p className="text-[11px] text-slate-500">
              Each store's vectors and embeddings are stored in a dedicated, isolated Qdrant collection.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-500">Store / Tenant:</span>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {selectedTenant}
          </span>
        </div>
      </div>

      {/* Floating Gmail-Style Toast Notification */}
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

      {/* Upload Dropzone */}
      <div className="relative mb-6 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8 text-center transition hover:border-sky-500 hover:bg-sky-50/20">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.csv,.json"
          onChange={handleFileSelect}
          disabled={uploading}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
          <span className="text-2xl">📤</span>
        </div>
        <h3 className="mt-4 text-base font-bold text-slate-900">
          {uploading ? "Uploading queued documents one by one..." : "Click or drag & drop files here"}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Select single or multiple files (PDF, Markdown, TXT, CSV, JSON). Files will be queued and indexed sequentially.
        </p>
      </div>

      {/* Upload Queue Section (Visible whenever there are files queued or recently uploaded) */}
      {uploadQueue.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Upload Queue ({completedCount + failedCount}/{uploadQueue.length})
                </h4>
                <p className="text-xs text-slate-500">
                  {uploading
                    ? `Uploading file ${currentUploadIndex + 1} of ${uploadQueue.length} one by one...`
                    : "Queue finished processing."}
                </p>
              </div>

              {!uploading && (
                <button
                  onClick={handleClearQueue}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear Queue
                </button>
              )}
            </div>

            {/* Progress Bar */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full transition-all duration-300 ${
                  failedCount > 0 ? "bg-amber-500" : "bg-sky-600"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {uploadQueue.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center justify-between px-6 py-3 transition ${
                  item.status === "uploading"
                    ? "bg-sky-50/60"
                    : item.status === "completed"
                    ? "bg-emerald-50/30"
                    : item.status === "failed"
                    ? "bg-rose-50/40"
                    : "bg-white"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-4">
                  <span className="text-base flex-shrink-0">
                    {item.status === "uploading" ? (
                      <span className="inline-block animate-spin">🔄</span>
                    ) : item.status === "completed" ? (
                      "✅"
                    ) : item.status === "failed" ? (
                      "❌"
                    ) : (
                      "⏳"
                    )}
                  </span>
                  <div className="truncate">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-400">
                      {formatFileSize(item.size)} • File #{idx + 1}
                    </p>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {item.status === "queued" && (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      Queued
                    </span>
                  )}
                  {item.status === "uploading" && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-600 animate-ping" />
                      Vectorizing & Embedding...
                    </span>
                  )}
                  {item.status === "completed" && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      Indexed ({item.chunkCount || 0} sections)
                    </span>
                  )}
                  {item.status === "failed" && (
                    <span
                      className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800"
                      title={item.error}
                    >
                      Failed: {item.error || "Error"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-bold text-slate-900">Store Documents ({documents.length})</h3>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchDocs(true)}
              disabled={loading || uploading || deletingAll}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              🔄 Refresh
            </button>

            {documents.length > 0 && (
              <button
                onClick={handleDeleteAll}
                disabled={loading || uploading || deletingAll}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
              >
                {deletingAll ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                    <span>Deleting All...</span>
                  </>
                ) : (
                  <>
                    <span>🗑️</span>
                    <span>Delete All Documents</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No documents added yet. Upload a policy or manual above!
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.map((doc) => {
              const state = deletingStates[doc.id];
              const isDeleting = state === "deleting";
              const isDeleted = state === "deleted";

              return (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between px-6 transition-all duration-400 ease-out overflow-hidden ${
                    isDeleted
                      ? "max-h-0 py-0 opacity-0 -translate-x-full scale-95 pointer-events-none"
                      : isDeleting
                      ? "max-h-24 py-4 bg-rose-50/70 opacity-80 border-l-4 border-rose-500"
                      : "max-h-24 py-4 hover:bg-slate-50 border-l-4 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition ${
                        isDeleting ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {isDeleting ? (
                        <span className="inline-block animate-spin text-sm">🔄</span>
                      ) : (
                        "📄"
                      )}
                    </div>
                    <div className="truncate">
                      <p
                        className={`truncate text-sm font-bold transition ${
                          isDeleting ? "text-rose-900 line-through opacity-75" : "text-slate-900"
                        }`}
                      >
                        {doc.filename}
                      </p>
                      <p className="text-xs text-slate-400">
                        {isDeleting ? (
                          <span className="font-semibold text-rose-600">Removing from knowledge base...</span>
                        ) : (
                          <>
                            Sections: <span className="font-semibold text-sky-600">{doc.chunk_count}</span> • Added{" "}
                            {new Date(doc.uploaded_at).toLocaleDateString()}
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isDeleting ? (
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-100/80 px-3 py-1.5 text-xs font-semibold text-rose-700 animate-pulse">
                        <span className="h-2 w-2 rounded-full bg-rose-600 animate-ping" />
                        Deleting...
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleInspectDoc(doc.id, doc.filename)}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                            isMarkdownFile(doc.filename)
                              ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-sky-600"
                          }`}
                        >
                          <span>{isMarkdownFile(doc.filename) ? "📄 View Document" : "📑 View Sections"}</span>
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id, doc.filename)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 transition"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Document / Sections Modal */}
      {selectedDoc && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs transition-opacity"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDocModal();
          }}
        >
          <div
            className={`relative flex flex-col w-full ${
              isMarkdownFile(selectedDoc.filename) ? "max-w-4xl" : "max-w-2xl"
            } max-h-[88vh] rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
          >
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-200/80 bg-white/95 px-6 py-4 backdrop-blur-md shrink-0 gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 text-lg shadow-2xs">
                  {isMarkdownFile(selectedDoc.filename) ? "📄" : "📑"}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 sm:text-base">
                      {isMarkdownFile(selectedDoc.filename)
                        ? "Markdown Document Viewer"
                        : "Document Sections"}
                    </h3>
                    {isMarkdownFile(selectedDoc.filename) && (
                      <span className="font-mono text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                        .md
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate max-w-sm sm:max-w-md">
                    {selectedDoc.filename}
                  </p>
                </div>
              </div>

              {/* View Switcher Tabs & Action Buttons */}
              <div className="flex items-center gap-2">
                {isMarkdownFile(selectedDoc.filename) && chunks.length > 0 && (
                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setDocViewTab("preview")}
                      className={`rounded-lg px-3 py-1 font-semibold transition ${
                        docViewTab === "preview"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Rendered View
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocViewTab("sections")}
                      className={`rounded-lg px-3 py-1 font-semibold transition ${
                        docViewTab === "sections"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Sections ({chunks.length})
                    </button>
                  </div>
                )}

                {/* Copy document content button */}
                {chunks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const text = chunks.map((c) => c.content).join("\n\n");
                      navigator.clipboard?.writeText(text);
                      setCopiedDoc(true);
                      setTimeout(() => setCopiedDoc(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                    title="Copy markdown content"
                  >
                    {copiedDoc ? "✓ Copied" : "Copy"}
                  </button>
                )}

                <button
                  onClick={handleCloseDocModal}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingChunks ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-3 border-sky-600 border-t-transparent" />
                  <p className="mt-3 text-xs font-semibold text-slate-600">
                    {isMarkdownFile(selectedDoc.filename)
                      ? "Rendering markdown document..."
                      : "Loading document sections..."}
                  </p>
                </div>
              ) : chunks.length === 0 ? (
                <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
                  <p className="text-sm font-semibold text-slate-600">No content found.</p>
                  <p className="mt-1 text-xs text-slate-400">
                    This document does not contain any indexed text chunks.
                  </p>
                </div>
              ) : isMarkdownFile(selectedDoc.filename) && docViewTab === "preview" ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-xs">
                  <MarkdownRenderer
                    content={chunks.map((c) => c.content).join("\n\n")}
                    isDocument={true}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {chunks.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 transition hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                        <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                          Section #{c.chunk_index + 1} of {c.total_chunks}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {c.char_count} characters
                        </span>
                      </div>
                      <div className="mt-2.5">
                        {isMarkdownFile(selectedDoc.filename) ? (
                          <MarkdownRenderer content={c.content} isDocument={false} />
                        ) : (
                          <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                            {c.content}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-3 shrink-0 text-xs text-slate-500">
              <span>
                {chunks.length} {chunks.length === 1 ? "section" : "sections"} indexed in vector store
              </span>
              <button
                type="button"
                onClick={handleCloseDocModal}
                className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
