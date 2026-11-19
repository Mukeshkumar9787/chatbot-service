"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import { getTenantFromUrl, buildTenantPath } from "@/lib/tenantUrl";

export default function TeamManagementPage() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedTenant, setSelectedTenant] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return getTenantFromUrl("smk_tenant");
    }
    return "smk_tenant";
  });
  const [loading, setLoading] = useState(true);

  // Modal & form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<any>(null);

  useEffect(() => {
    const t = getTenantFromUrl("smk_tenant");
    setSelectedTenant(t);
  }, []);

  const getToken = () => {
    return localStorage.getItem("rag_token") || localStorage.getItem("token") || "";
  };

  const fetchUsers = async () => {
    const token = getToken();
    if (!token) {
      router.push(buildTenantPath("/admin/login", selectedTenant));
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/${encodeURIComponent(selectedTenant)}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        router.push(buildTenantPath("/admin/login", selectedTenant));
        return;
      }

      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
        if (data.currentUser) {
          setCurrentUser(data.currentUser);
        }
      }
    } catch (err: any) {
      setMessage("Error loading team: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("rag_user");
      if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
      } else {
        const storedToken = localStorage.getItem("rag_token") || localStorage.getItem("token");
        if (storedToken) {
          const payloadBase64 = storedToken.split(".")[1];
          if (payloadBase64) {
            const json = JSON.parse(atob(payloadBase64));
            setCurrentUser(json);
          }
        }
      }
    } catch {
      // Ignore token parse error
    }
    fetchUsers();
  }, [selectedTenant]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen) {
        setIsModalOpen(false);
        setErrorMsg("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    setErrorMsg("");

    try {
      setSubmitting(true);
      const res = await fetch(`/api/${encodeURIComponent(selectedTenant)}/auth/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          name,
          role: "SUPPORT_ADMIN",
          password,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessage(`Admin ${email} created successfully!`);
        setEmail("");
        setName("");
        setPassword("");
        setIsModalOpen(false);
        await fetchUsers();
      } else {
        setErrorMsg(data.error || "Failed to create user");
      }
    } catch (err: any) {
      setErrorMsg("Error: " + err.message);
    } finally {
      setSubmitting(false);
      setTimeout(() => setMessage(""), 5000);
    }
  };

  const handleDeleteUser = async (userId: string, emailStr: string) => {
    if (
      currentUser &&
      ((currentUser.id && String(currentUser.id) === String(userId)) ||
        (currentUser.email && currentUser.email.toLowerCase() === emailStr.toLowerCase()))
    ) {
      alert("You cannot delete your own administrator account.");
      return;
    }

    if (!confirm(`Are you sure you want to remove administrator ${emailStr}?`)) return;

    const token = getToken();
    try {
      const res = await fetch(`/api/${encodeURIComponent(selectedTenant)}/auth/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessage(`Admin ${emailStr} removed.`);
        await fetchUsers();
        setTimeout(() => setMessage(""), 4000);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete user");
      }
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Navigation Header */}
      <AdminHeader
        title="Support Team Management"
        subtitle="Manage administrator accounts with access to store documents and support settings."
      />

      {/* Tenant Indicator */}
      <div className="mb-6 flex items-center justify-between rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">🏢 Target Store / Tenant:</span>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {selectedTenant}
          </span>
        </div>
        <span className="text-[11px] text-slate-500 font-medium">
          Managing administrators specifically for this tenant
        </span>
      </div>

      {/* Notification Banner */}
      {message && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 flex items-center justify-between">
          <span>✓ {message}</span>
          <button onClick={() => setMessage("")} className="text-emerald-600 hover:text-emerald-900 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Main Members Card */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Active Administrators</h2>
            <p className="text-xs text-slate-500">
              Only authenticated administrators can manage documents and configure the knowledge base.
            </p>
          </div>

          <button
            onClick={() => {
              setErrorMsg("");
              setIsModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            <span>+</span>
            <span>Add Team Member</span>
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
            <p className="mt-2 text-xs text-slate-500">Loading team members...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <p className="text-sm">No administrators found.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((u) => {
              const isSelf = Boolean(
                currentUser &&
                  ((currentUser.id && String(currentUser.id) === String(u.id)) ||
                    (currentUser.email && currentUser.email.toLowerCase() === u.email.toLowerCase()))
              );

              return (
                <div key={u.id} className="flex items-center justify-between py-4 transition hover:bg-slate-50/50 px-2 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-600">
                      {(u.name || u.email || "A").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{u.name || u.email}</p>
                        {isSelf && (
                          <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-purple-100 px-3 py-1 text-[11px] font-bold text-purple-700">
                      {u.role || "SUPPORT_ADMIN"}
                    </span>
                    <button
                      onClick={() => {
                        setResetTargetUser(isSelf ? null : u);
                        setResetModalOpen(true);
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                    >
                      🔑 Reset Password
                    </button>
                    {isSelf ? (
                      <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400 select-none">
                        Current User
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-100 hover:text-rose-700"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Team Member</h3>
                <p className="text-xs text-slate-500">Provision a new administrator account.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Error banner inside modal */}
            {errorMsg && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                {errorMsg}
              </div>
            )}

            {/* Modal Form */}
            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@smk.store"
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-sky-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Administrator"
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-2xl bg-sky-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Administrator"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      <ResetPasswordModal
        isOpen={resetModalOpen}
        onClose={() => {
          setResetModalOpen(false);
          setResetTargetUser(null);
        }}
        targetUser={resetTargetUser}
        tenantId={selectedTenant}
        onSuccess={(msg) => {
          setMessage(msg);
          setTimeout(() => setMessage(""), 5000);
        }}
      />
    </div>
  );
}
