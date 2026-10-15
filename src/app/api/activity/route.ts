import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { getActivity } from "@/lib/storage";
import { getTenantFromHeaders } from "@/lib/tenant";
import { requireTenantAccess } from "@/platform/infra/auth";
import { trackError } from "@/platform/infra/monitoring";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

export async function GET(request: Request) {
  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    await authorizeTenantOperatorRead(tenant);

    const url = new URL(request.url);
    const section = url.searchParams.get("section") || undefined;
    const actor = url.searchParams.get("actor") || undefined;

    const activity = await getActivity(tenant, { section, actor });
    return NextResponse.json(activity);
  } catch (err) {
    // A denial or a failure must not look like an empty History. No tenant in
    // the Sentry context: the route name is enough.
    if (err instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: "You don't have access to this History.", code: "activity_forbidden" }, { status: 403 });
    }
    trackError(err, { route: "api/activity", op: "GET" });
    return NextResponse.json({ error: "History couldn't be read right now. Nothing changed.", code: "activity_unavailable" }, { status: 503 });
  }
}
