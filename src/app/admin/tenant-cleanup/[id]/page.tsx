import { notFound, redirect } from "next/navigation";
import { isSuperAdmin } from "@/platform/infra/auth";
import { isValidDeprovisionTenantId } from "@/lib/deprovision";
import { CleanupRecovery } from "./CleanupRecovery";

export const dynamic = "force-dynamic";

export default async function TenantCleanupPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) redirect("/sign-in");
  const { id } = await params;
  if (!isValidDeprovisionTenantId(id)) notFound();
  // Deliberately requires no tenant row: the native receipt survives removal.
  return <CleanupRecovery key={id} tenantId={id} />;
}
