import { redirect } from "next/navigation";

// The per-tenant cockpit moved to /admin/clients/[id] (the single detail URL).
// This route stays only as a redirect so existing links keep resolving.
export default async function TenantDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/clients/${id}`);
}
