import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { getTenantConfig } from "@/lib/tenants";
import { logAuditEvent } from "@/lib/storage";
import { redeployVercelProject } from "@/lib/vercel";

/**
 * Trigger a Vercel redeploy for a tenant's site project.
 *
 * POST — fires a new production deployment sourced from the tenant's latest
 *        existing deployment (the Vercel-supported retry path). Returns the
 *        new deployment id + initial state. Super-admin only, audit-logged.
 *
 * No request body needed. The project name is derived server-side as `{id}-site`,
 * matching how `getVercelProjectStatus` already resolves it in the cockpit page.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const config = await getTenantConfig(id);
  if (!config) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const projectName = `${id}-site`;
  const result = await redeployVercelProject(projectName);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  await logAuditEvent({
    tenant: id,
    action: "vercel.redeploy",
    targetType: "tenant",
    targetId: id,
    actor: await getActorContext(id),
    metadata: { projectName, deploymentId: result.data.deploymentId, state: result.data.state },
  }).catch(() => {});

  return NextResponse.json({ deploymentId: result.data.deploymentId, state: result.data.state });
}
