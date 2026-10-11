import { authorizeTenantOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { getTenantFromHeaders } from "@/lib/tenant";
import { getActorContext, requireTenantAccess, requireTenantPermission, verifyAuth } from "@/platform/infra/auth";
import { discoverGoogleResources, selectGoogleResource, type GoogleResourceKind } from "@/lib/google-resources";

function isKind(value: unknown): value is GoogleResourceKind {
  return value === "gsc" || value === "ga4" || value === "gbp";
}
export async function GET() {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantAccess(tenant);
    if (denied) return denied;
    await authorizeTenantOperatorRead(tenant);
    return NextResponse.json(await discoverGoogleResources(tenant));
  } catch (error) {
    console.error("[google resources GET]", error);
    return NextResponse.json({ error: "Failed to load Google resources" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authed = await verifyAuth();
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tenant = await getTenantFromHeaders();
    const denied = await requireTenantPermission(tenant, "settings:write");
    if (denied) return denied;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A Google resource selection is required" }, { status: 400 });
    }
    const kind = (body as Record<string, unknown>).kind;
    const resourceId = (body as Record<string, unknown>).resourceId;
    if (!isKind(kind) || typeof resourceId !== "string" || !resourceId.trim()) {
      return NextResponse.json({ error: "kind and resourceId are required" }, { status: 400 });
    }

    let actor: WorkspaceActor | undefined;
    if (kind === "gbp") {
      const context = await getActorContext(tenant);
      const identity = z.object({ userId: z.string().uuid(), verifiedEmail: z.string().trim().email().transform(value => value.toLowerCase()) })
        .safeParse({ userId: context.userId, verifiedEmail: context.email });
      if (!identity.success || !["user", "super_admin"].includes(context.type)) return NextResponse.json({ error: "Confirmed settings authority required." }, { status: 403 });
      actor = identity.data;
    }
    const catalog = await selectGoogleResource(tenant, kind, resourceId, actor);
    return NextResponse.json(catalog);
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    const status = code === "resource_id_invalid" ? 400 : code === "scope_not_granted" || code === "google_settings_permission_denied" ? 403 : code === "persistence_unavailable" ? 503 : code === "resources_unavailable" || code === "resource_not_available" || code === "google_operation_superseded" ? 409 : 500;
    if (status === 500) console.error("Google resource selection could not be committed.");
    return NextResponse.json({ error: code === "google_settings_permission_denied" ? "Confirmed settings authority required." : code === "google_operation_superseded" ? "Google account access changed. Reload its resources before selecting again." : status === 403 ? "Reconnect Google with the requested permission." : status === 409 ? "That Google resource is no longer available to this account." : status === 503 ? "Google resource selection is temporarily unavailable." : status === 400 ? "That Google resource selection is invalid." : "Failed to save Google resource selection." }, { status });
  }
}
