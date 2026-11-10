"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";

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

const STORAGE_QUEUE_KEY = "smk_chat_offline_queue";
const STORAGE_CONV_KEY = "smk_chat_conversation_id";
const STORAGE_MSGS_KEY = "smk_chat_messages_v1";

export default function ChatWidgetPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial_welcome",
      role: "assistant",
      content:
        "👋 Hello! I am your AI store assistant. Ask me anything about our return policy, shipping times, warranty, or catalog details!",
      status: "sent",
      timestamp: Date.now(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>("");

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

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: item.text, conversationId: currentConvId, stream: false }),
        });

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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });

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
      window.parent.postMessage({ type: "CLOSE_SMK_CHATBOT" }, "*");
    }
  };

  const quickPrompts = [
    "What is your return policy?",
    "How long does shipping take?",
    "Do you offer a warranty?",
  ];

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-white sm:h-[540px] sm:rounded-[28px] sm:border sm:border-slate-200 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#f0f9ff_100%)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <img
            src="/images/logo/smk.jpg"
            alt="SMK Logo"
            className="h-9 w-9 rounded-2xl object-contain shadow-sm border border-slate-100"
          />
          <div>
            <h4 className="text-sm font-bold text-slate-900 leading-tight">SMK Assistant</h4>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isOffline ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                }`}
              />
              {isOffline ? "Offline Mode (Queuing)" : "Store Help Online"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setMessages([
                {
                  id: "reset_welcome",
                  role: "assistant",
                  content: "Chat cleared! How can I assist you with store documentation?",
                  status: "sent",
                  timestamp: Date.now(),
                },
              ]);
              localStorage.removeItem(STORAGE_MSGS_KEY);
            }}
            title="Clear conversation"
            className="rounded-xl p-1.5 text-xs text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
          >
            🔄
          </button>
          <button
            onClick={handleClose}
            title="Close chat"
            className="rounded-xl p-1.5 text-xs text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Network Outage / Offline Banner */}
      {(isOffline || offlineQueue.length > 0) && (
        <div className="bg-amber-500/10 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs text-amber-900 transition animate-in fade-in">
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
      )}

      {/* Reconnected Toast */}
      {reconnectedToast && (
        <div className="bg-emerald-500/10 border-b border-emerald-200 px-4 py-1.5 text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in">
          <span>✓</span>
          <span className="text-[11px]">Back online! All queued messages sent successfully.</span>
        </div>
      )}

      {/* Suggested Prompts */}
      {messages.length === 1 && !isOffline && (
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Suggested Questions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(p)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"
              >
                {p}
              </button>
            ))}
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
                    : "bg-[linear-gradient(135deg,#0284c7_0%,#0f766e_100%)] text-white shadow-sm rounded-br-none"
                  : "border border-slate-200/80 bg-white text-slate-800 shadow-sm rounded-bl-none"
              }`}
            >
              <MarkdownRenderer
                content={msg.content}
                isUser={msg.role === "user"}
              />
            </div>

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
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-bounce" />
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:0.2s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:0.4s]" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box (Kept enabled even during offline mode so user can queue questions) */}
      <div className="border-t border-slate-100 bg-white p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 focus-within:border-sky-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-sky-100 transition">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isOffline
                ? "Type a question to queue for offline delivery..."
                : "Ask about store documents..."
            }
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim()}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-600 text-white transition hover:bg-sky-700 disabled:opacity-40"
            title={isOffline ? "Queue message" : "Send message"}
          >
            {isOffline ? "⏳" : "➤"}
          </button>
        </div>
      </div>
    </div>
  );
}
