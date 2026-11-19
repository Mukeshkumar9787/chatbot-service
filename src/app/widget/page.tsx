"use client";

import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { getTenantFromUrl } from "@/lib/tenantUrl";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "sent" | "queued" | "sending" | "failed";
  timestamp?: number;
}

interface QueuedItem {
  id: string;
  text: string;
  timestamp: number;
}

interface ChatWidgetProps {
  tenantParam?: string;
}

const BASE_STORAGE_QUEUE_KEY = "smk_chat_offline_queue";
const BASE_STORAGE_CONV_KEY = "smk_chat_conversation_id";
const BASE_STORAGE_MSGS_KEY = "smk_chat_messages_v1";

function ChatWidgetInner({ tenantParam }: ChatWidgetProps) {
  const searchParams = useSearchParams();
  const routeParams = useParams();
  const routeTenant = tenantParam || (routeParams?.tenant as string) || "";
  const tenantSlug = searchParams.get("tenant") || "";
  const tenantId = searchParams.get("tenantId") || "";
  const queryStoreName = searchParams.get("storeName") || "";
  const queryPrimary = searchParams.get("primaryColor") || "";
  const queryAccent = searchParams.get("accentColor") || "";
  const queryAssistantName = searchParams.get("assistantName") || "";

  const resolvedTenant =
    tenantSlug ||
    routeTenant ||
    (tenantId && tenantId.startsWith("tenant_") ? tenantId : "") ||
    tenantId ||
    (typeof window !== "undefined" ? getTenantFromUrl("smk_tenant") : "smk_tenant");

  const effectiveTenantKey = resolvedTenant;

  const isDefaultTenant =
    !resolvedTenant ||
    resolvedTenant === "smk_tenant" ||
    resolvedTenant === "default" ||
    resolvedTenant === "tenant_smk_default";

  // Derive initial store name from tenant slug if not passed (e.g. 'blipkart' -> 'Blipkart')
  const fallbackStoreName = isDefaultTenant
    ? "SMK Store"
    : resolvedTenant.charAt(0).toUpperCase() + resolvedTenant.slice(1);

  const initialStoreName = queryStoreName || fallbackStoreName;
  const initialAssistantName =
    queryAssistantName || (isDefaultTenant ? "SMK Assistant" : `${initialStoreName} Assistant`);

  const STORAGE_QUEUE_KEY = `${BASE_STORAGE_QUEUE_KEY}_${effectiveTenantKey}`;
  const STORAGE_CONV_KEY = `${BASE_STORAGE_CONV_KEY}_${effectiveTenantKey}`;
  const STORAGE_MSGS_KEY = `${BASE_STORAGE_MSGS_KEY}_${effectiveTenantKey}`;

  const [branding, setBranding] = useState<{
    primaryColor: string;
    accentColor: string;
    storeName: string;
    assistantName: string;
  }>({
    primaryColor: queryPrimary || "#3C50E0",
    accentColor: queryAccent || "#0EA5E9",
    storeName: initialStoreName,
    assistantName: initialAssistantName,
  });

  const welcomeContent = `👋 Hello! I am your AI assistant for ${initialStoreName}. Ask me anything about our products, return policy, shipping times, warranty, or catalog details!`;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial_welcome",
      role: "assistant",
      content: welcomeContent,
      status: "sent",
      timestamp: Date.now(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");
  const [rateLimitCooldown, setRateLimitCooldown] = useState<number>(0);
  const [isTenantDisabled, setIsTenantDisabled] = useState(false);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  // Check tenant status & synchronize dynamic branding theme
  useEffect(() => {
    const targetTenant = resolvedTenant;
    fetch(`/api/${encodeURIComponent(targetTenant)}/status`)
      .then((res) => {
        if (res.status === 404) {
          setIsTenantDisabled(true);
        }
        return res.json();
      })
      .then((data) => {
        if (!data || data.active === false || data.status === "INACTIVE" || data.error) {
          setIsTenantDisabled(true);
          setBrandingLoaded(true);
          return;
        }
        if (data && data.branding) {
          const effectiveStore = data.branding.storeName || data.name || initialStoreName;
          const effectiveAssistant =
            data.branding.assistantName ||
            (effectiveStore ? `${effectiveStore} Assistant` : "Assistant");

          setBranding({
            primaryColor: data.branding.primaryColor || queryPrimary || "#3C50E0",
            accentColor: data.branding.accentColor || queryAccent || "#0EA5E9",
            storeName: effectiveStore,
            assistantName: effectiveAssistant,
          });

          // Sync initial welcome message greeting if conversation hasn't started yet
          setMessages((prev) => {
            if (prev.length === 1 && prev[0].id === "initial_welcome") {
              return [
                {
                  id: "initial_welcome",
                  role: "assistant",
                  content: `👋 Hello! I am your AI assistant for ${effectiveStore}. Ask me anything about our products, return policy, shipping times, warranty, or catalog details!`,
                  status: "sent",
                  timestamp: Date.now(),
                },
              ];
            }
            return prev;
          });
        }
        setBrandingLoaded(true);
      })
      .catch(() => {
        setBrandingLoaded(true);
      });
  }, [resolvedTenant, queryStoreName, queryPrimary, queryAccent, queryAssistantName]);

  // Rate limit cooldown countdown timer
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

  // Offline queue state
  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<QueuedItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [reconnectedToast, setReconnectedToast] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, isSyncing]);

  // Load persisted session and queued messages on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check online status
    if (!navigator.onLine) {
      setIsOffline(true);
    }

    // Restore conversation ID
    const savedConv = localStorage.getItem(STORAGE_CONV_KEY);
    if (savedConv) {
      setConversationId(savedConv);
    }

    // Restore offline queue
    try {
      const savedQueue = localStorage.getItem(STORAGE_QUEUE_KEY);
      if (savedQueue) {
        const parsed: QueuedItem[] = JSON.parse(savedQueue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOfflineQueue(parsed);
          // Append queued messages into visible chat list
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newQueued: Message[] = parsed
              .filter((q) => !existingIds.has(q.id))
              .map((q) => ({
                id: q.id,
                role: "user",
                content: q.text,
                status: "queued",
                timestamp: q.timestamp,
              }));
            return [...prev, ...newQueued];
          });
        }
      }
    } catch {
      // Ignore parse failure
    }
  }, []);

  // Persist messages in localStorage for continuity
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (messages.length > 1) {
        localStorage.setItem(STORAGE_MSGS_KEY, JSON.stringify(messages.slice(-30)));
      }
    } catch {}
  }, [messages]);

  // Enqueue message into offline queue
  const enqueueOfflineMessage = useCallback((item: QueuedItem) => {
    setIsOffline(true);
    setMessages((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, status: "queued" } : m))
    );
    setOfflineQueue((prev) => {
      if (prev.some((q) => q.id === item.id)) return prev;
      const updated = [...prev, item];
      try {
        localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  // Drain offline queue once connection is restored
  const drainOfflineQueue = useCallback(async () => {
    if (typeof window === "undefined") return;

    const stored = localStorage.getItem(STORAGE_QUEUE_KEY);
    let queueToDrain: QueuedItem[] = [];
    try {
      queueToDrain = stored ? JSON.parse(stored) : [];
    } catch {
      queueToDrain = [];
    }

    if (queueToDrain.length === 0) {
      setIsOffline(false);
      return;
    }

    setIsSyncing(true);
    setIsOffline(false);

    let currentConvId = conversationId || localStorage.getItem(STORAGE_CONV_KEY) || "";

    for (const item of queueToDrain) {
      try {
        setMessages((prev) =>
          prev.map((m) => (m.id === item.id ? { ...m, status: "sending" } : m))
        );

        const targetTenant = resolvedTenant;
        const res = await fetch(`/api/${encodeURIComponent(targetTenant)}/chat?tenant=${encodeURIComponent(tenantSlug || targetTenant)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: item.text,
            conversationId: currentConvId,
            stream: false,
          }),
        });

        if (res.status === 429) {
          const errData = await res.json().catch(() => ({}));
          const retryAfter = errData.retryAfterSeconds || parseInt(res.headers.get("Retry-After") || "30", 10) || 30;
          setRateLimitCooldown(retryAfter);
          setMessages((prev) => [
            ...prev,
            {
              id: `asst_rl_${Date.now()}`,
              role: "assistant",
              content: `⏳ Taking a brief pause. Message syncing will resume in ${retryAfter} seconds.`,
              status: "sent",
              timestamp: Date.now(),
            },
          ]);
          setMessages((prev) =>
            prev.map((m) => (m.id === item.id ? { ...m, status: "queued" } : m))
          );
          break; // Stop draining until cooldown finishes without setting isOffline=true
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (data.success) {
          if (data.conversation_id) {
            currentConvId = data.conversation_id;
            setConversationId(currentConvId);
            localStorage.setItem(STORAGE_CONV_KEY, currentConvId);
          }

          // Mark message as sent
          setMessages((prev) =>
            prev.map((m) => (m.id === item.id ? { ...m, status: "sent" } : m))
          );

          // Append assistant response
          setMessages((prev) => [
            ...prev,
            {
              id: `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              role: "assistant",
              content: data.answer,
              status: "sent",
              timestamp: Date.now(),
            },
          ]);

          // Remove item from state and localStorage
          setOfflineQueue((prev) => {
            const rem = prev.filter((q) => q.id !== item.id);
            localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(rem));
            return rem;
          });
        } else {
          throw new Error(data.error || "Server response unsuccessful");
        }
      } catch (err: any) {
        console.warn(`[Offline Queue] Failed processing item ${item.id}:`, err);
        setIsOffline(true);
        setMessages((prev) =>
          prev.map((m) => (m.id === item.id ? { ...m, status: "queued" } : m))
        );
        break; // Stop draining if network is still unreachable
      }
    }

    setIsSyncing(false);
    setReconnectedToast(true);
    setTimeout(() => setReconnectedToast(false), 4000);
  }, [conversationId]);

  // Window online/offline event listeners
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      console.log("[Chat Widget] Network is back online. Draining queued messages...");
      setIsOffline(false);
      drainOfflineQueue();
    };

    const handleOffline = () => {
      console.warn("[Chat Widget] Network went offline. Queuing enabled.");
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [drainOfflineQueue]);

  // Send message handler with offline-fallback queueing
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim()) return;

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userMsg: Message = {
      id: msgId,
      role: "user",
      content: text,
      status: "sending",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");

    // If client is already offline, queue immediately without waiting for fetch timeout
    if (typeof window !== "undefined" && !navigator.onLine) {
      enqueueOfflineMessage({ id: msgId, text, timestamp: Date.now() });
      return;
    }

    setLoading(true);

    try {
      const targetTenant = resolvedTenant;
      const res = await fetch(`/api/${encodeURIComponent(targetTenant)}/chat?tenant=${encodeURIComponent(tenantSlug || targetTenant)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
      });

      if (res.status === 429) {
        const errorData = await res.json().catch(() => ({}));
        const retryAfter = errorData.retryAfterSeconds || parseInt(res.headers.get("Retry-After") || "30", 10) || 30;
        setRateLimitCooldown(retryAfter);
        setMessages((prev) => [
          ...prev,
          {
            id: `asst_${Date.now()}`,
            role: "assistant",
            content: `⏳ ${errorData.error || `Please wait ${retryAfter}s before sending another message.`}`,
            status: "sent",
            timestamp: Date.now(),
          },
        ]);
        setLoading(false);
        return;
      }

      if (res.status === 400) {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.error && errorData.error.toLowerCase().includes("turnstile")) {
          setMessages((prev) => [
            ...prev,
            {
              id: `asst_${Date.now()}`,
              role: "assistant",
              content: `🛡️ ${errorData.error}`,
              status: "sent",
              timestamp: Date.now(),
            },
          ]);
          setLoading(false);
          return;
        }
      }

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      // Mark user message as sent
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, status: "sent" } : m))
      );

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedAnswer = "";
        const asstId = `asst_${Date.now()}`;
        let addedAssistantMessage = false;

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
                if (event.conversation_id) {
                  setConversationId(event.conversation_id);
                  localStorage.setItem(STORAGE_CONV_KEY, event.conversation_id);
                }
              } else if (event.type === "chunk") {
                accumulatedAnswer += event.text;

                if (!addedAssistantMessage) {
                  addedAssistantMessage = true;
                  setLoading(false);
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: asstId,
                      role: "assistant",
                      content: accumulatedAnswer,
                      status: "sent",
                      timestamp: Date.now(),
                    },
                  ]);
                } else {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === asstId ? { ...m, content: accumulatedAnswer } : m
                    )
                  );
                }
              } else if (event.type === "done") {
                if (event.answer) {
                  accumulatedAnswer = event.answer;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === asstId ? { ...m, content: accumulatedAnswer } : m
                    )
                  );
                }
              }
            } catch {
              // Ignore partial chunk parse error
            }
          }
        }
      } else {
        // Fallback for non-streaming json responses
        const data = await res.json();
        if (data.success) {
          if (data.conversation_id) {
            setConversationId(data.conversation_id);
            localStorage.setItem(STORAGE_CONV_KEY, data.conversation_id);
          }

          setMessages((prev) => [
            ...prev,
            {
              id: `asst_${Date.now()}`,
              role: "assistant",
              content: data.answer,
              status: "sent",
              timestamp: Date.now(),
            },
          ]);
        } else {
          throw new Error(data.error || "Failed to get response");
        }
      }
    } catch (err: any) {
      console.warn("[Chat Widget] Fetch failed, queueing message:", err.message);
      enqueueOfflineMessage({ id: msgId, text, timestamp: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClose = () => {
    if (typeof window !== "undefined") {
      if (window.self !== window.top) {
        window.parent.postMessage({ type: "CLOSE_SMK_CHATBOT" }, "*");
      } else {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = "/";
        }
      }
    }
  };

  const quickPrompts = [
    "What is your return policy?",
    "How long does shipping take?",
    "Do you offer a warranty?",
  ];

  if (isTenantDisabled) {
    return (
      <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-slate-50 p-6 text-center sm:h-[540px] sm:rounded-[28px] sm:border sm:border-slate-200 shadow-xl font-sans text-slate-800">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200/60 text-2xl mb-3 shadow-inner">
          🔍
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">404</h1>
        <h2 className="mt-1 text-base font-bold text-slate-700">Page Not Found</h2>
        <p className="mt-2 max-w-xs text-xs text-slate-500 leading-relaxed">
          The requested store or AI chatbot assistant is currently inactive, disabled, or does not exist.
        </p>
      </div>
    );
  }

  if (!brandingLoaded) {
    return (
      <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-white sm:h-[540px] sm:rounded-[28px] sm:border sm:border-slate-200 shadow-xl font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
          <p className="text-xs font-semibold text-slate-500 animate-pulse">
            Loading assistant...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white sm:h-[540px] sm:rounded-[28px] sm:border sm:border-slate-200 shadow-xl">
      {/* Header with dynamic brand stripe and title */}
      <div className="relative border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#f0f9ff_100%)] px-5 py-3.5 shrink-0 overflow-hidden">
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ backgroundColor: branding.primaryColor }}
        />
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-2xl text-white font-bold text-sm shadow-sm shrink-0 border border-black/5"
              style={{ backgroundColor: branding.primaryColor }}
            >
              {(branding.storeName || "A").charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 leading-tight">
                {branding.assistantName || (branding.storeName ? `${branding.storeName} Assistant` : "Store Assistant")}
              </h4>
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isOffline ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                  }`}
                />
                {isOffline
                  ? "Offline Mode (Queuing)"
                  : (branding.storeName ? `${branding.storeName} Online Assistant` : "Store Help & Documentation Online")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Clear conversation */}
            <button
              onClick={() => {
                setMessages([
                  {
                    id: "reset_welcome",
                    role: "assistant",
                    content: branding.storeName
                      ? `Chat cleared! How can I assist you with ${branding.storeName}?`
                      : "Chat cleared! How can I assist you with store documentation?",
                    status: "sent",
                    timestamp: Date.now(),
                  },
                ]);
                localStorage.removeItem(STORAGE_MSGS_KEY);
              }}
              title="Clear conversation"
              className="rounded-xl p-1.5 text-xs text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/>
              </svg>
            </button>

            {/* Close button */}
            <button
              onClick={handleClose}
              title="Close chat"
              className="rounded-xl p-1.5 text-xs text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Network Outage / Offline Banner */}
      {(isOffline || offlineQueue.length > 0) && (
        <div className="bg-amber-500/10 border-b border-amber-200 px-4 py-2 shrink-0">
          <div className="flex items-center justify-between text-xs text-amber-900 w-full">
            <div className="flex items-center gap-2">
              <span className="text-sm">📶</span>
              <span className="font-medium text-[11px]">
                {isSyncing
                  ? `Syncing ${offlineQueue.length} queued message(s)...`
                  : `Network offline (${offlineQueue.length} queued). Messages will send automatically when online.`}
              </span>
            </div>
            <button
              onClick={drainOfflineQueue}
              disabled={isSyncing}
              className="rounded-lg bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900 hover:bg-amber-300 transition disabled:opacity-50"
            >
              {isSyncing ? "Syncing..." : "Retry Now"}
            </button>
          </div>
        </div>
      )}

      {/* Reconnected Toast */}
      {reconnectedToast && (
        <div className="bg-emerald-500/10 border-b border-emerald-200 px-4 py-1.5 text-xs font-semibold text-emerald-800 shrink-0">
          <div className="flex items-center gap-2 w-full">
            <span>✓</span>
            <span className="text-[11px]">Back online! All queued messages sent successfully.</span>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/30">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                msg.role === "user"
                  ? msg.status === "queued"
                    ? "bg-amber-600/90 text-white shadow-sm rounded-br-none"
                    : "text-white shadow-sm rounded-br-none"
                  : "border border-slate-200/80 bg-white text-slate-800 shadow-sm rounded-bl-none"
              }`}
              style={
                msg.role === "user" && msg.status !== "queued"
                  ? { backgroundColor: branding.primaryColor, color: "#ffffff" }
                  : undefined
              }
            >
              <MarkdownRenderer
                content={msg.content}
                isUser={msg.role === "user"}
              />
            </div>

            {/* Suggested questions below initial welcome message */}
            {(msg.id === "initial_welcome" || msg.id === "reset_welcome") && messages.length === 1 && !isOffline && (
              <div className="mt-2.5 flex flex-wrap gap-1.5 max-w-[95%]">
                {quickPrompts.map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(p)}
                    style={{ borderColor: `${branding.primaryColor}35` }}
                    className="rounded-full border bg-white px-3 py-1.5 text-[11px] text-slate-700 transition hover:shadow-sm text-left leading-normal"
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = branding.primaryColor;
                      (e.currentTarget as HTMLElement).style.color = branding.primaryColor;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = `${branding.primaryColor}35`;
                      (e.currentTarget as HTMLElement).style.color = "";
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Offline Queue Indicator under user message bubble */}
            {msg.role === "user" && msg.status === "queued" && (
              <span className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                <span>⏳</span>
                <span>Queued (waiting for connection)</span>
              </span>
            )}
            {msg.role === "user" && msg.status === "sending" && (
              <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                <span>🔄</span>
                <span>Sending...</span>
              </span>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 w-20 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ backgroundColor: branding.primaryColor }} />
            <span className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:0.2s]" style={{ backgroundColor: branding.primaryColor }} />
            <span className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:0.4s]" style={{ backgroundColor: branding.primaryColor }} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="border-t border-slate-100 bg-white p-3 shrink-0">
        {isTenantDisabled && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] text-rose-800 animate-fadeIn">
            <span className="flex items-center gap-1.5 font-medium">
              <span>⚠️</span>
              <span>AI Chatbot assistant is currently inactive for this store.</span>
            </span>
          </div>
        )}

        {rateLimitCooldown > 0 && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-800 animate-fadeIn">
            <span className="flex items-center gap-1.5 font-medium">
              <span>⏳</span>
              <span>Taking a quick breather! Please wait <strong>{rateLimitCooldown}s</strong> before messaging again.</span>
            </span>
          </div>
        )}

        <div className={`flex items-center gap-2 rounded-2xl border px-3 py-1.5 transition shadow-sm ${
          rateLimitCooldown > 0
            ? "border-amber-300 bg-amber-50/40"
            : "border-slate-200 bg-slate-50/50 focus-within:border-sky-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-sky-100"
        }`}>
          <input
            type="text"
            value={inputMessage}
            disabled={loading || rateLimitCooldown > 0 || isTenantDisabled}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isTenantDisabled
                ? "Chatbot assistant is currently inactive..."
                : rateLimitCooldown > 0
                ? `Please wait ${rateLimitCooldown}s...`
                : isOffline
                ? "Type a question to queue for offline delivery..."
                : "Ask about store documents..."
            }
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || loading || rateLimitCooldown > 0 || isTenantDisabled}
            style={{
              backgroundColor:
                !inputMessage.trim() || loading || rateLimitCooldown > 0 || isTenantDisabled
                  ? undefined
                  : branding.primaryColor,
            }}
            className="flex h-7 min-w-[28px] px-1.5 items-center justify-center rounded-xl bg-sky-600 text-white text-xs font-semibold transition hover:brightness-110 disabled:opacity-40 shadow-sm shrink-0"
            title={rateLimitCooldown > 0 ? `Wait ${rateLimitCooldown}s` : (isOffline ? "Queue message" : "Send message")}
          >
            {rateLimitCooldown > 0 ? `${rateLimitCooldown}s` : (isOffline ? "⏳" : "➤")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatWidgetPage({ tenantParam }: ChatWidgetProps = {}) {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center p-4 text-xs text-slate-400">Loading assistant...</div>}>
      <ChatWidgetInner tenantParam={tenantParam} />
    </Suspense>
  );
}
