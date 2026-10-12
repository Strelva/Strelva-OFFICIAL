import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedOperatorContext, getCurrentUserEmail, isSuperAdmin } from "@/platform/infra/auth";
import { getTenantConfig } from "@/lib/tenants";
import { getConnections } from "@/lib/connections";
import { getProducts } from "@/lib/products";
import { logAuditEvent } from "@/lib/storage";
import { RELEASE_FLAGS } from "@/platform/release-flags/resolve";
import { ReleaseFlagConflictError, ReleaseFlagValidationError } from "@/platform/release-flags/store";
import { applyTenantReleaseCommand, readTenantReleaseState, type TenantPageFacts } from "@/platform/owner-entry/operator";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

/**
 * Per-workspace release flags for one client (owner-entry spec §3.7).
 * Super-admin only; the database rechecks the operator. GET reads the state,
 * history and the pages blocking owner entry; POST changes one flag or one
 * named tester, with a reason. Changes reach every server within 60 seconds.
 */

const command = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("flag"),
    flag: z.enum(RELEASE_FLAGS),
    state: z.enum(["off", "operators", "on", "unset"]),
    reason: z.string().trim().min(3).max(480),
    expectedRevision: z.number().int().min(0),
  }).strict(),
  z.object({
    kind: z.literal("tester"),
    email: z.string().trim().email(),
    present: z.boolean(),
    reason: z.string().trim().min(3).max(480),
  }),
]);

const noStore = { "Cache-Control": "private, no-store" };

async function facts(tenantId: string): Promise<TenantPageFacts | null> {
  const config = await getTenantConfig(tenantId);
  if (!config) return null;
  const [connections, products] = await Promise.all([
    getConnections(tenantId).catch(() => []),
    getProducts(tenantId).catch(() => []),
  ]);
  return { tenantConfig: { ...config, features: config.features }, connections, hasCommerce: products.length > 0 };
}

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: "Only an active Strelva operator can change release flags." }, { status: 403, headers: noStore });
  if (error instanceof ReleaseFlagConflictError) return NextResponse.json({ error: error.message }, { status: 409, headers: noStore });
  if (error instanceof ReleaseFlagValidationError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400, headers: noStore });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the request. A reason of 3 to 480 characters is required." }, { status: 400, headers: noStore });
  console.error("[release-flags] operator route failed", error);
  return NextResponse.json({ error: "The release flag result couldn't be confirmed. Refresh the current flags before attempting another change." }, { status: 503, headers: noStore });
}

async function operator() {
  if (!(await isSuperAdmin())) return null;
  return getCurrentUserEmail();
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const email = await operator();
  if (!email) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  try {
    await authorizeAdminOperatorRead("admin.tenant-controls.read");
    const { id } = await params;
    const tenantFacts = await facts(id);
    if (!tenantFacts) return NextResponse.json({ error: "Tenant not found" }, { status: 404, headers: noStore });
    return NextResponse.json(await readTenantReleaseState(email, id, tenantFacts), { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const operatorContext = await getAuthenticatedOperatorContext();
  if (!operatorContext) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const email = operatorContext.email;
  try {
    const { id } = await params;
    const tenantFacts = await facts(id);
    if (!tenantFacts) return NextResponse.json({ error: "Tenant not found" }, { status: 404, headers: noStore });
    const body = command.parse(await request.json().catch(() => null));
    const accepted = await applyTenantReleaseCommand(operatorContext.actor, id, tenantFacts, body);
    // This receipt comes from the accepted RPC, independent of subsequent reads.
    const mutation = { status: "accepted" as const, workspaceId: accepted.workspaceId, command: body };
    await logAuditEvent({
      tenant: id,
      action: "tenant.release-flag",
      targetType: "tenant",
      targetId: id,
      actor: { userId: operatorContext.actor.userId, email, type: "super_admin", isSuperAdmin: true },
      metadata: body.kind === "flag" ? { flag: body.flag, state: body.state, reason: body.reason } : { tester: body.email, present: body.present, reason: body.reason },
    }).catch(() => {});
    try {
      const state = await readTenantReleaseState(email, id, tenantFacts);
      return NextResponse.json({ ...state, mutation, readback: { status: "available" } }, { headers: noStore });
    } catch {
      return NextResponse.json({ mutation, readback: { status: "unavailable" }, notice: "The change was accepted. Current flags and history couldn't be read. Refresh the flags before making another change." }, { headers: noStore });
    }
  } catch (error) {
    return failure(error);
  }
}
