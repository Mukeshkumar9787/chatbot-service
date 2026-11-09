import "./globals.css";
import React from "react";

export const metadata = {
  title: "SMK AI Assistant & Qdrant Knowledge Hub",
  description: "Autonomous Document-Grounded Chatbot powered by Qdrant Vector DB & Next.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}

