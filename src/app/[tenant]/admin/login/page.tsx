"use client";

import LoginPage from "@/app/admin/login/page";

export default function TenantLoginWrapper() {
  // The original LoginPage handles tenant detection from the URL.
  return <LoginPage />;
}
