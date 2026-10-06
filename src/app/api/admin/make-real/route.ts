import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserEmail, isSuperAdmin } from "@/lib/auth";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { customerActivationView, describeActivation } from "@/platform/make-real/view";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const ids = { workspaceId: z.string().uuid(), activationId: z.string().min(1).max(120) };
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resume"), ...ids }).strict(),
  z.object({ action: z.literal("rollback"), ...ids, confirm: z.literal(true) }).strict(),
  z.object({ action: z.literal("reconcile"), ...ids, stepId: z.string().min(1).max(80), resolution: z.enum(["completed", "not_applied"]),
    evidence: z.string().trim().min(10).max(2000), providerRef: z.string().max(240).optional() }).strict(),
]);

/**
 * Operator tools for one Make real activation (systems-experience spec
 * section 4): read its state, resume after fixing the cause, reconcile an
 * unknown step with evidence, or roll back. Super admins only. For a
 * business Strelva runs, each action runs as Strelva (system), logged in
 * strelva_service_actions with the operator named; otherwise it runs as the
 * owner whose approval started the activation, as before. The owner stays
 * approver of record either way. Nothing here rolls back on its own.
 */
export async function GET(request: Request) {
  const operator = await operatorEmail();
  if (!operator) return NextResponse.json({ error: "Only a Strelva operator can open this." }, { status: 403, headers: noStore });
  const url = new URL(request.url);
  const parsed = z.object(ids).safeParse({ workspaceId: url.searchParams.get("workspaceId"), activationId: url.searchParams.get("activationId") });
  if (!parsed.success) return NextResponse.json({ error: "Check the request." }, { status: 400, headers: noStore });
  try {
    const { activationStarter, activationRunner, liveMakeReal } = await import("@/platform/make-real/live-server");
    // The starter reads it; once the starter has left, Strelva (system) does (a logged session).
    const actor = await activationStarter(parsed.data.workspaceId, parsed.data.activationId)
      ?? (await activationRunner(parsed.data.workspaceId, parsed.data.activationId))?.actor ?? null;
    if (!actor) return NextResponse.json({ error: "That activation is not available." }, { status: 404, headers: noStore });
    const activation = await liveMakeReal.read(actor, parsed.data.workspaceId, parsed.data.activationId);
    return NextResponse.json({ activation, view: describeActivation(activation), customer: customerActivationView(activation, "this change") }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const operator = await operatorEmail();
  if (!operator) return NextResponse.json({ error: "Only a Strelva operator can change this." }, { status: 403, headers: noStore });
  const parsed = command.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the request. Reconciling needs evidence of at least 10 characters; rolling back needs confirm." }, { status: 400, headers: noStore });
  const input = parsed.data;
  try {
    const { activationRunner, liveMakeReal } = await import("@/platform/make-real/live-server");
    const runner = await activationRunner(input.workspaceId, input.activationId);
    if (!runner) return NextResponse.json({ error: "That activation is not available." }, { status: 404, headers: noStore });
    const { actor, service } = runner;
    const note = service ? `${service.label} for operator ${operator}` : `operator ${operator}`;
    // Strelva (system) acts only once its log has the row; the owner's approval is untouched.
    if (service) {
      const { recordServiceAction } = await import("@/platform/needs-you/service-actor");
      await recordServiceAction(service, input.action, `activation:${input.activationId}`, note);
    }
    const activation = input.action === "resume" ? await liveMakeReal.resume(actor, input.workspaceId, input.activationId, note)
      : input.action === "rollback" ? await liveMakeReal.rollback(actor, input.workspaceId, input.activationId, note)
        : await liveMakeReal.reconcile(actor, input.workspaceId, input.activationId, { stepId: input.stepId, resolution: input.resolution, evidence: input.evidence, ...(input.providerRef ? { providerRef: input.providerRef } : {}), note });
    return NextResponse.json({ activation, view: describeActivation(activation) }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

async function operatorEmail(): Promise<string | null> {
  if (!(await isSuperAdmin())) return null;
  return getCurrentUserEmail();
}

function failure(error: unknown) {
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: error.message || "Access changed. Nothing was changed." }, { status: 403, headers: noStore });
  if (error instanceof WorkspaceConflictError) return NextResponse.json({ error: error.message }, { status: 409, headers: noStore });
  console.error("[make-real] operator route failed", error);
  return NextResponse.json({ error: "The activation could not be read or changed. Nothing was changed." }, { status: 503, headers: noStore });
}
