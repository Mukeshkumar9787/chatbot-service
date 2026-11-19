import { redirect } from "next/navigation";

interface TenantPageProps {
  params: { tenant: string };
}

export default function TenantPage({ params }: TenantPageProps) {
  const tenant = params?.tenant || "smk_tenant";
  redirect(`/${encodeURIComponent(tenant)}/admin/documents`);
}
