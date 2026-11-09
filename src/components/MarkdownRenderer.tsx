"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isUser?: boolean;
}

export default function MarkdownRenderer({
  content,
  className = "",
  isUser = false,
}: MarkdownRendererProps) {
  // If user bubble, keep text white and clean
  if (isUser) {
    return (
      <div className={`whitespace-pre-wrap break-words leading-relaxed ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div
      className={`prose prose-slate max-w-none text-xs leading-relaxed break-words ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2.5 last:mb-0 text-slate-800 leading-relaxed">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-slate-950">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-700">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="mb-2.5 last:mb-0 pl-4 space-y-1 list-disc text-slate-800 marker:text-sky-500">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2.5 last:mb-0 pl-4 space-y-1 list-decimal text-slate-800 marker:text-sky-600 font-medium">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-0.5 text-slate-800 leading-normal">{children}</li>
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
                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-pink-600 border border-slate-200"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="my-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] font-mono text-slate-100 shadow-sm">
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-sky-400 pl-3 italic text-slate-600">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-[11px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50 text-slate-700 font-bold">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>
          ),
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-slate-700 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-600">{children}</td>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-sm font-extrabold text-slate-900">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 mt-2.5 text-xs font-bold text-slate-900">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-xs font-semibold text-slate-800">{children}</h3>
          ),
          hr: () => <hr className="my-2 border-slate-200" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

