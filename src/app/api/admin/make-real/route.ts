import { authorizeAdminOperatorRead } from "@/platform/operator-read-audit/admission";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserEmail, isSuperAdmin } from "@/platform/infra/auth";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { customerActivationView, describeActivation } from "@/platform/make-real/view";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const ids = { workspaceId: z.string().uuid(), activationId: z.string().min(1).max(120) };
/** Audited support inspection only. Client commands use the ordinary workspace actor. */
export async function GET(request: Request) {
  const operator = await operatorEmail();
  if (!operator) return NextResponse.json({ error: "Only a Strelva operator can open this." }, { status: 403, headers: noStore });
  const url = new URL(request.url);
  const parsed = z.object(ids).safeParse({ workspaceId: url.searchParams.get("workspaceId"), activationId: url.searchParams.get("activationId") });
  if (!parsed.success) return NextResponse.json({ error: "Check the request." }, { status: 400, headers: noStore });
  try {
    await authorizeAdminOperatorRead("admin.make-real.read");
    const { activationStarter, activationRunner, liveMakeReal } = await import("@/experience/systems/live-server");
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

/** Client publication and reconciliation require the ordinary workspace actor. */
export async function POST(_request: Request) {
  if (!await operatorEmail()) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  return NextResponse.json({ error: "Client changes require ordinary business or agency access. Nothing changed." }, { status: 410, headers: noStore });
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
