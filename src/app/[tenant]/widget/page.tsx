"use client";

import ChatWidget from "@/app/widget/page";
import { useParams } from "next/navigation";

export default function TenantWidgetWrapper() {
  const params = useParams();
  const tenant = (params?.tenant as string) || "";
  return <ChatWidget tenantParam={tenant} />;
}
