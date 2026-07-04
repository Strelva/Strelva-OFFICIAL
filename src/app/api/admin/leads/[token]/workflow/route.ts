import { NextResponse } from "next/server";
import { isSuperAdmin, getActorContext } from "@/lib/auth";
import { logAuditEvent } from "@/lib/storage";
import {
  setLeadWorkflowStatus,
  LEAD_WORKFLOW_STATUSES,
  type LeadWorkflowStatus,
} from "@/lib/lead-workflow";

/**
 * Operator workflow status for one onboard-form lead — how the operator is
 * working the lead (new / contacted / converted / dismissed), keyed by the
 * lead's stable `statusToken`. Layered ON TOP of the lead record; never touches
 * the Sanity / delivery-lead storage. Super-admin only. Audit-logged.
 *
 * POST { status, note? } — set the workflow status, return the final state.
 */

const TOKEN_RE = /^[a-f0-9]{36}$/;

function isStatus(value: unknown): value is LeadWorkflowStatus {
  return typeof value === "string" && LEAD_WORKFLOW_STATUSES.includes(value as LeadWorkflowStatus);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { token } = await params;
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid lead token." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { status, note } = (body ?? {}) as { status?: unknown; note?: unknown };

  if (!isStatus(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${LEAD_WORKFLOW_STATUSES.join(", ")}.` },
      { status: 400 },
    );
  }

  const workflow = await setLeadWorkflowStatus(
    token,
    status,
    typeof note === "string" ? note : undefined,
  );

  await logAuditEvent({
    // Leads are pre-tenant; logAuditEvent defaults an empty tenant to the
    // control-plane default so the operator action still lands in the trail.
    tenant: "",
    action: "lead.workflow",
    targetType: "lead",
    targetId: token,
    actor: await getActorContext(),
    metadata: { status },
  }).catch(() => {});

  return NextResponse.json({ workflow });
}
