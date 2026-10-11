import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { z } from "zod";
import { resolveOwnerBrand, resolveTenantBrand } from "@/platform/agency-brand/server";
import { listWorkspaces } from "@/platform/workspaces/repository";
import { requireTenantAccess } from "@/platform/infra/auth";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({ error: "Sign in with a confirmed email." }, 401);
  try {
    const params = new URL(request.url).searchParams;
    if (params.has("workspaceId")) {
      const id = z.string().uuid().parse(params.get("workspaceId"));
      if (!(await listWorkspaces(actor)).some(w => w.id === id)) return workspaceJson({ error: "Workspace unavailable." }, 403);
      return workspaceJson({ brand: await resolveOwnerBrand(id) });
    }
    const tenantId = z.string().min(1).max(120).parse(params.get("tenantId"));
    const denied = await requireTenantAccess(tenantId); if (denied) return denied;
    await authorizeTenantOperatorRead(tenantId);
    return workspaceJson({ brand: await resolveTenantBrand(tenantId) });
  } catch (error) { return workspaceHttpFailure(error); }
}
