import "./globals.css";
import React from "react";

export const metadata = {
  title: "Store Customer Support & Knowledge Hub",
  description: "Customer Support and AI Knowledge Base Assistant",
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

