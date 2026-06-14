import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantConfig } from "@/lib/tenants";
import { TenantEditor } from "./TenantEditor";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getTenantConfig(id);
  if (!tenant) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-gray-muted hover:text-warm-white">
          ← Overview
        </Link>
        <h1 className="text-2xl font-semibold text-warm-white mt-2">{tenant.siteName}</h1>
        <p className="text-sm text-gray-muted mt-1">
          {tenant.id} · {tenant.deliveryModel ?? "custom_repo"} ·{" "}
          {tenant.active ? "active" : "archived"}
        </p>
      </div>

      <TenantEditor
        tenant={{
          id: tenant.id,
          ownerName: tenant.ownerName ?? "",
          ownerEmail: tenant.ownerEmail ?? "",
          productionDomain: tenant.productionDomain ?? "",
          adminDomain: tenant.adminDomain ?? "",
          subscriptionStatus: tenant.subscriptionStatus ?? "none",
          planOverride: tenant.planOverride ?? "",
          active: tenant.active,
          revalidateUrl: tenant.revalidateUrl ?? "",
          hasRevalidationSecret: Boolean(tenant.revalidationSecret),
        }}
      />
    </div>
  );
}
