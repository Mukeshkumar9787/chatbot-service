"use client";

import React, { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    document: string;
    chunk_index: number;
    snippet: string;
    relevance_score: number;
  }>;
}

export default function ChatWidgetPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "👋 Hello! I am your AI store assistant. Ask me anything about our return policy, shipping times, warranty, or catalog details!",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            sources: data.sources || [],
          },
        ]);
      } else {
        throw new Error(data.error || "Failed to get response");
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Sorry, could not connect to the knowledge service: " + err.message,
        },
      ]);
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
    <div className="flex h-screen w-full flex-col overflow-hidden bg-white sm:h-[540px] sm:rounded-[28px] sm:border sm:border-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#f0f9ff_100%)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-md shadow-sky-500/20 text-sm">
            🤖
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 leading-tight">SMK Assistant</h4>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Grounded in Qdrant Vector DB
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              setMessages([
                {
                  role: "assistant",
                  content: "Chat cleared! How can I assist you with store documentation?",
                },
              ])
            }
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

      {/* Suggested Prompts */}
      {messages.length === 1 && (
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
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-[linear-gradient(135deg,#0284c7_0%,#0f766e_100%)] text-white shadow-sm rounded-br-none"
                  : "border border-slate-200/80 bg-white text-slate-800 shadow-sm rounded-bl-none"
              }`}
            >
              <p className="whitespace-pre-line">{msg.content}</p>
            </div>

            {/* Citations */}
            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {msg.sources.map((s, sIdx) => (
                  <span
                    key={sIdx}
                    className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700"
                    title={s.snippet}
                  >
                    📄 {s.document} ({Math.round(s.relevance_score * 100)}%)
                  </span>
                ))}
              </div>
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

      {/* Input Box */}
      <div className="border-t border-slate-100 bg-white p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 focus-within:border-sky-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-sky-100 transition">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about store documents..."
            disabled={loading}
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={loading || !inputMessage.trim()}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-600 text-white transition hover:bg-sky-700 disabled:opacity-40"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}

