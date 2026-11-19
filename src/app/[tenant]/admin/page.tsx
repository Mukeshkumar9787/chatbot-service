import { redirect } from "next/navigation";

export default function TenantAdminIndexPage({
  params,
}: {
  params: { tenant: string };
}) {
  const tenant = params?.tenant || "smk_tenant";
  redirect(`/${encodeURIComponent(tenant)}/admin/documents`);
}
