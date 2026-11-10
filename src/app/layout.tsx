import "./globals.css";
import React from "react";

export const metadata = {
  title: "SMK Customer Support & Help Center",
  description: "Customer Support and Knowledge Base for SMK Store",
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

