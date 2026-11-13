"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isUser?: boolean;
  isDocument?: boolean;
}

export default function MarkdownRenderer({
  content,
  className = "",
  isUser = false,
  isDocument = false,
}: MarkdownRendererProps) {
  // If user bubble, keep text white and clean
  if (isUser) {
    return (
      <div className={`whitespace-pre-wrap break-words leading-relaxed ${className}`}>
        {content}
      </div>
    );
  }

  const baseTextClass = isDocument ? "text-sm text-slate-800" : "text-xs text-slate-800";

  return (
    <div
      className={`prose prose-slate max-w-none ${isDocument ? "text-sm" : "text-xs"} leading-relaxed break-words ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className={`mb-3 last:mb-0 ${baseTextClass} leading-relaxed`}>{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-slate-950">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-700">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 last:mb-0 pl-5 space-y-1.5 list-disc text-slate-800 marker:text-sky-500">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 last:mb-0 pl-5 space-y-1.5 list-decimal text-slate-800 marker:text-sky-600 font-medium">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className={`pl-0.5 ${baseTextClass} leading-normal`}>{children}</li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 underline font-medium hover:text-sky-800 transition"
            >
              {children}
            </a>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code
                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[12px] font-mono text-pink-600 border border-slate-200"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-3 overflow-x-auto rounded-2xl bg-slate-900 p-4 text-[12px] font-mono text-slate-100 shadow-sm border border-slate-800">
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-sky-400 pl-4 py-1.5 italic text-slate-600 bg-sky-50/50 rounded-r-xl">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50 text-slate-800 font-bold">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
          ),
          tr: ({ children }) => <tr className="hover:bg-slate-50/50 transition">{children}</tr>,
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 text-slate-800 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2.5 text-slate-600">{children}</td>
          ),
          h1: ({ children }) => (
            <h1 className={`${isDocument ? "text-xl font-extrabold pb-2 mb-3 mt-4 border-b border-slate-200" : "text-sm font-extrabold mb-2 mt-3"} text-slate-900`}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className={`${isDocument ? "text-lg font-bold pb-1 mb-2.5 mt-3.5" : "text-xs font-bold mb-1.5 mt-2.5"} text-slate-900`}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className={`${isDocument ? "text-base font-semibold mb-2 mt-3" : "text-xs font-semibold mb-1 mt-2"} text-slate-800`}>{children}</h3>
          ),
          hr: () => <hr className="my-3 border-slate-200" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

